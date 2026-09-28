import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type inquiry } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import {
  Inquiry,
  InquiryStatus,
  InquirySubmissionReceipt,
} from './entities/inquiry.entity';

const DEFAULT_INQUIRY_TYPE = 'GENERAL';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

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
        submittedAt: created.created_at,
      };
    });
  }

  async findAll(query: ListInquiriesQueryDto): Promise<Inquiry[]> {
    const items = await this.prisma.inquiry.findMany({
      where: { status: query.status },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<Inquiry> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  // Status-only change by a curator (REQ-4.8-06/11).
  async update(
    id: string,
    dto: UpdateInquiryDto,
    actingCuratorAccountId: string,
  ): Promise<Inquiry> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      if (String(existing.status) === String(dto.status)) {
        return this.toEntity(existing);
      }

      const updated = await transaction.inquiry.update({
        where: { id },
        data: {
          status: dto.status,
          reviewed_by: actingCuratorAccountId,
          updated_at: new Date(),
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        inquiryId: id,
        action: 'UPDATE_INQUIRY_STATUS',
        details: { previousStatus: existing.status, status: updated.status },
      });
      return this.toEntity(updated);
    });
  }

  async remove(id: string, actingCuratorAccountId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        await transaction.inquiry.delete({ where: { id } });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          inquiryId: id,
          action: 'DELETE_INQUIRY',
          details: { previousStatus: existing.status },
        });
      });
    } catch (error) {
      // Referenced by a visit request or communication history.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This inquiry has linked records and cannot be deleted.',
        );
      }
      throw error;
    }
  }

  private async findOneOrThrow(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<inquiry> {
    const found = await client.inquiry.findUnique({ where: { id } });
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

  private toEntity(item: inquiry): Inquiry {
    return {
      id: item.id,
      name: item.full_name,
      email: item.email_address,
      phone: item.contact_number,
      organization: item.organization_name,
      inquiryType: item.inquiry_type,
      message: item.message,
      status: item.status as InquiryStatus,
      consentAcceptedAt: item.consent_accepted_at,
      reviewedBy: item.reviewed_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}
