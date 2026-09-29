import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommunicationEntry } from '../communication-history/communication-history.entity';
import {
  CommunicationType,
  describeStatusChange,
  listEntries,
  recordInternalEntry,
  recordOutboundEmail,
} from '../communication-history/communication-history';
import { CreateInternalNoteDto } from '../communication-history/dto/create-internal-note.dto';
import { SendVisitorMessageDto } from '../communication-history/dto/send-visitor-message.dto';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import {
  REFERENCE_CODE_PATTERN,
  buildVisitorEmail,
  referenceCode,
  referenceIdRange,
} from '../mail/visitor-email';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import { VisitRequestsService } from '../visit-requests/visit-requests.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { ReferInquiryDto } from './dto/refer-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import {
  Inquiry,
  InquiryReferralResult,
  InquiryStatus,
  InquirySubmissionReceipt,
} from './entities/inquiry.entity';
import {
  DELETABLE_INQUIRY_STATUSES,
  assertInquiryTransition,
} from './inquiry-status.policy';

const DEFAULT_INQUIRY_TYPE = 'GENERAL';

const CONFLICT_MESSAGE =
  'This inquiry was changed by someone else. Reload and try again.';

const INQUIRY_INCLUDE = {
  visit_request: { select: { id: true } },
} satisfies Prisma.inquiryInclude;

type InquiryRecord = Prisma.inquiryGetPayload<{
  include: typeof INQUIRY_INCLUDE;
}>;

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitRequestsService: VisitRequestsService,
    private readonly mail: MailService,
  ) {}

  // Public submission (REQ-4.8-01/04). Stored with its consent timestamp and
  // audited without any visitor personal data in the audit details.
  async create(dto: CreateInquiryDto): Promise<InquirySubmissionReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      const submittedAt = new Date();
      const created = await transaction.inquiry.create({
        data: {
          full_name: dto.name,
          email_address: dto.email,
          contact_number: dto.phone ?? null,
          organization_name: dto.organization ?? null,
          inquiry_type: dto.inquiryType ?? DEFAULT_INQUIRY_TYPE,
          message: dto.message,
          status: 'PENDING',
          consent_accepted_at: submittedAt,
          created_at: submittedAt,
          updated_at: submittedAt,
        },
      });
      await this.recordAudit(transaction, {
        userId: null,
        inquiryId: created.id,
        action: 'SUBMIT_INQUIRY',
        details: { inquiryType: created.inquiry_type },
      });

      return {
        id: created.id,
        status: created.status as InquiryStatus,
        referenceCode: referenceCode(created.id),
        submittedAt: created.created_at,
      };
    });
  }

  async findAll(query: ListInquiriesQueryDto): Promise<Inquiry[]> {
    const search = query.search
      ? { contains: query.search, mode: Prisma.QueryMode.insensitive }
      : undefined;
    const items = await this.prisma.inquiry.findMany({
      where: {
        status: query.status,
        ...(search && {
          OR: [
            { full_name: search },
            { email_address: search },
            { organization_name: search },
            { inquiry_type: search },
            { message: search },
            ...(REFERENCE_CODE_PATTERN.test(query.search ?? '')
              ? [{ id: referenceIdRange(query.search!) }]
              : []),
          ],
        }),
      },
      include: INQUIRY_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<Inquiry> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  // Status-only change by a curator (REQ-4.8-06/12), limited to the SRS
  // B.3 transitions and recorded in the inquiry's timeline.
  async update(
    id: string,
    dto: UpdateInquiryDto,
    actingCuratorAccountId: string,
  ): Promise<Inquiry> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        const previousStatus = existing.status as InquiryStatus;
        if (previousStatus === (dto.status as InquiryStatus)) {
          return this.toEntity(existing);
        }
        assertInquiryTransition(previousStatus, dto.status);

        const updated = await transaction.inquiry.update({
          where: { id },
          data: {
            status: dto.status,
            reviewed_by: actingCuratorAccountId,
            updated_at: new Date(),
          },
          include: INQUIRY_INCLUDE,
        });
        await recordInternalEntry(transaction, {
          target: { inquiryId: id },
          recordedBy: actingCuratorAccountId,
          type: CommunicationType.STATUS_CHANGE,
          message: describeStatusChange(previousStatus, dto.status, dto.note),
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          inquiryId: id,
          action: 'UPDATE_INQUIRY_STATUS',
          details: { previousStatus, status: updated.status },
        });
        return this.toEntity(updated);
      },
      CONFLICT_MESSAGE,
    );
  }

  // Manual referral to the Visit Request workflow (REQ-4.8-07). The new
  // request starts Pending and is never auto-approved; the inquiry becomes
  // Turned to Visit Request in the same transaction.
  async refer(
    id: string,
    dto: ReferInquiryDto,
    actingCuratorAccountId: string,
  ): Promise<InquiryReferralResult> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        const previousStatus = existing.status as InquiryStatus;
        assertInquiryTransition(
          previousStatus,
          InquiryStatus.TURNED_TO_VISIT_REQUEST,
        );

        const phone = dto.phone ?? existing.contact_number;
        const organization = dto.organization ?? existing.organization_name;
        const missing = [
          !phone && 'phone',
          !organization && 'organization',
        ].filter(Boolean);
        if (!phone || !organization) {
          throw new BadRequestException(
            `The inquiry has no ${missing.join(' or ')}, so the referral must include it.`,
          );
        }
        if (!existing.consent_accepted_at) {
          throw new BadRequestException(
            'This inquiry has no consent record, so it cannot be referred.',
          );
        }

        const visitRequestId =
          await this.visitRequestsService.createFromReferral(
            transaction,
            {
              sourceInquiryId: id,
              name: existing.full_name,
              email: existing.email_address,
              phone,
              organization,
              purpose: dto.purpose ?? null,
              visitorCount: dto.visitorCount,
              preferredSchedules: dto.preferredSchedules,
              consentAcceptedAt: existing.consent_accepted_at,
            },
            actingCuratorAccountId,
          );
        const updated = await transaction.inquiry.update({
          where: { id },
          data: {
            status: InquiryStatus.TURNED_TO_VISIT_REQUEST,
            reviewed_by: actingCuratorAccountId,
            updated_at: new Date(),
          },
          include: INQUIRY_INCLUDE,
        });
        await recordInternalEntry(transaction, {
          target: { inquiryId: id },
          recordedBy: actingCuratorAccountId,
          type: CommunicationType.REFERRAL,
          message: describeStatusChange(
            previousStatus,
            InquiryStatus.TURNED_TO_VISIT_REQUEST,
            [`Referred to visit request ${visitRequestId}.`, dto.note]
              .filter(Boolean)
              .join('\n\n'),
          ),
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          inquiryId: id,
          action: 'REFER_INQUIRY',
          details: { previousStatus, visitRequestId },
        });

        return {
          inquiry: { ...this.toEntity(updated), visitRequestId },
          visitRequestId,
        };
      },
      CONFLICT_MESSAGE,
    );
  }

  // Internal curator note, e.g. a reply the visitor sent to the museum's
  // external mailbox (REQ-4.8-12). The note text is not copied into the
  // audit log, which only records that a note was added.
  async addNote(
    id: string,
    dto: CreateInternalNoteDto,
    actingCuratorAccountId: string,
  ): Promise<CommunicationEntry> {
    return this.prisma.$transaction(async (transaction) => {
      await this.findOneOrThrow(transaction, id);
      const entry = await recordInternalEntry(transaction, {
        target: { inquiryId: id },
        recordedBy: actingCuratorAccountId,
        type: CommunicationType.NOTE,
        message: dto.message,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        inquiryId: id,
        action: 'ADD_INQUIRY_NOTE',
        details: { entryId: entry.id },
      });
      return entry;
    });
  }

  async listHistory(id: string): Promise<CommunicationEntry[]> {
    await this.findOneOrThrow(this.prisma, id);
    return listEntries(this.prisma, { inquiryId: id });
  }

  // Curator reply emailed to the visitor through BioSphere (REQ-4.8-05/09).
  // The status does not change. The reply is recorded in the timeline with
  // its delivery result, and the audit keeps no message text or address.
  async sendReply(
    id: string,
    dto: SendVisitorMessageDto,
    actingCuratorAccountId: string,
  ): Promise<CommunicationEntry> {
    const inquiry = this.toEntity(await this.findOneOrThrow(this.prisma, id));
    const email = buildVisitorEmail({
      to: inquiry.email,
      visitorName: inquiry.name,
      subject:
        dto.subject ??
        `Re: your BioSphere museum inquiry (Ref ${inquiry.referenceCode})`,
      paragraphs: ['Thank you for contacting the museum.'],
      curatorMessage: dto.message,
      reference: inquiry.referenceCode,
    });
    const delivery = await this.mail.send(email);

    return this.prisma.$transaction(async (transaction) => {
      const entry = await recordOutboundEmail(transaction, {
        target: { inquiryId: id },
        recordedBy: actingCuratorAccountId,
        type: CommunicationType.MESSAGE_EMAIL,
        recipientEmail: email.to,
        subject: email.subject,
        message: email.text,
        deliveryResult: delivery.result,
        delivered: delivery.delivered,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        inquiryId: id,
        action: 'EMAIL_VISITOR',
        details: {
          entryId: entry.id,
          communicationType: CommunicationType.MESSAGE_EMAIL,
          delivered: delivery.delivered,
        },
      });
      return entry;
    });
  }

  // Deletes a finished inquiry and its timeline. A referred inquiry stays
  // while its visit request exists, so the referral link is never broken.
  // The audit log keeps a record of the deletion.
  async remove(id: string, actingCuratorAccountId: string): Promise<void> {
    await runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        const previousStatus = existing.status as InquiryStatus;
        if (!DELETABLE_INQUIRY_STATUSES.includes(previousStatus)) {
          throw new BadRequestException(
            'Only a closed or referred inquiry can be deleted. Close it first.',
          );
        }
        if (existing.visit_request) {
          throw new ConflictException(
            `This inquiry was referred to visit request ${existing.visit_request.id}. Delete that request first.`,
          );
        }

        await transaction.communication_history.deleteMany({
          where: { inquiry_id: id },
        });
        await transaction.inquiry.delete({ where: { id } });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          inquiryId: id,
          action: 'DELETE_INQUIRY',
          details: { previousStatus },
        });
      },
      CONFLICT_MESSAGE,
    );
  }

  private async findOneOrThrow(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<InquiryRecord> {
    const found = await client.inquiry.findUnique({
      where: { id },
      include: INQUIRY_INCLUDE,
    });
    if (!found) {
      throw new NotFoundException(`Inquiry ${id} not found`);
    }
    return found;
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string | null;
      inquiryId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.inquiryId,
        affected_record_type: 'inquiry',
        action: params.action,
        module: 'inquiries',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: InquiryRecord): Inquiry {
    return {
      id: item.id,
      referenceCode: referenceCode(item.id),
      name: item.full_name,
      email: item.email_address,
      phone: item.contact_number,
      organization: item.organization_name,
      inquiryType: item.inquiry_type,
      message: item.message,
      status: item.status as InquiryStatus,
      consentAcceptedAt: item.consent_accepted_at,
      reviewedBy: item.reviewed_by,
      visitRequestId: item.visit_request?.id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}
