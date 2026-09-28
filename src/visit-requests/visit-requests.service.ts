import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommunicationEntry } from '../communication-history/communication-history.entity';
import {
  CommunicationType,
  describeStatusChange,
  listEntries,
  recordInternalEntry,
} from '../communication-history/communication-history';
import { CreateInternalNoteDto } from '../communication-history/dto/create-internal-note.dto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import { ApproveVisitScheduleDto } from './dto/approve-visit-schedule.dto';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { ListVisitRequestsQueryDto } from './dto/list-visit-requests-query.dto';
import { PreferredScheduleDto } from './dto/preferred-schedule.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import {
  CampusEntrySummary,
  VisitRequest,
  VisitRequestStatus,
  VisitRequestSubmissionReceipt,
} from './entities/visit-request.entity';
import {
  CAMPUS_ENTRY_STATUSES,
  assertVisitRequestTransition,
} from './visit-request-status.policy';

// The museum operates in Philippine time; "today" for past-date checks is
// the current date there, not the server's UTC date.
const MUSEUM_TIME_ZONE = 'Asia/Manila';

const CONFLICT_MESSAGE =
  'This visit request was changed by someone else. Reload and try again.';

const VISIT_REQUEST_INCLUDE = {
  preferred_visit_date: { orderBy: { preference_order: 'asc' } },
  visit_request_visitor: true,
  visit_request_vehicle: true,
} satisfies Prisma.visit_requestInclude;

type VisitRequestRecord = Prisma.visit_requestGetPayload<{
  include: typeof VISIT_REQUEST_INCLUDE;
}>;

// What an inquiry referral (REQ-4.8-07) needs to open a visit request.
// Consent is carried over from the inquiry's own consent record.
export interface VisitRequestReferral {
  sourceInquiryId: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  purpose: string | null;
  visitorCount: number;
  preferredSchedules: PreferredScheduleDto[];
  consentAcceptedAt: Date;
}

@Injectable()
export class VisitRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // Public submission (REQ-4.9-01 to 06). The request and all of its child
  // records are written in one transaction and audited without any visitor
  // personal data in the audit details.
  async create(
    dto: CreateVisitRequestDto,
  ): Promise<VisitRequestSubmissionReceipt> {
    this.assertSchedulesValid(dto.preferredSchedules);
    this.assertVisitorsValid(dto);
    this.assertVehicleValid(dto);

    return this.prisma.$transaction(async (transaction) => {
      const submittedAt = new Date();
      const created = await transaction.visit_request.create({
        data: {
          contact_person: dto.name,
          email_address: dto.email,
          contact_number: dto.phone,
          organization_name: dto.organization,
          address: dto.address ?? null,
          purpose_of_visit: dto.purpose,
          visitor_count: dto.visitorCount,
          miscellaneous_details: dto.equipment || null,
          additional_notes: dto.notes || null,
          consent_accepted_at: submittedAt,
          status: 'PENDING',
          created_at: submittedAt,
          updated_at: submittedAt,
          preferred_visit_date: {
            create: this.toPreferredDateRows(dto.preferredSchedules),
          },
          visit_request_visitor: {
            create: (dto.visitors ?? []).map((visitor) => ({
              visitor_name: [visitor.firstName, visitor.lastName]
                .filter(Boolean)
                .join(' '),
            })),
          },
          visit_request_vehicle: {
            create: dto.bringingVehicle
              ? [
                  {
                    plate_number: dto.plateNumber ?? null,
                    vehicle_brand: dto.carBrand ?? null,
                    vehicle_type: dto.carType ?? null,
                  },
                ]
              : [],
          },
        },
      });
      await this.recordAudit(transaction, {
        userId: null,
        visitRequestId: created.id,
        action: 'SUBMIT_VISIT_REQUEST',
        details: {
          preferredScheduleCount: dto.preferredSchedules.length,
          visitorCount: dto.visitorCount,
        },
      });

      return {
        id: created.id,
        status: created.status as VisitRequestStatus,
        submittedAt: created.created_at,
      };
    });
  }

  // Opens a Pending visit request from a curator's inquiry referral. Runs
  // inside the caller's transaction so the inquiry's status change and the
  // new request are saved together. It is never auto-approved (§4.8.2).
  async createFromReferral(
    transaction: Prisma.TransactionClient,
    referral: VisitRequestReferral,
    actingCuratorAccountId: string,
  ): Promise<string> {
    this.assertSchedulesValid(referral.preferredSchedules);

    const createdAt = new Date();
    const created = await transaction.visit_request.create({
      data: {
        source_inquiry_id: referral.sourceInquiryId,
        contact_person: referral.name,
        email_address: referral.email,
        contact_number: referral.phone,
        organization_name: referral.organization,
        purpose_of_visit: referral.purpose,
        visitor_count: referral.visitorCount,
        consent_accepted_at: referral.consentAcceptedAt,
        status: 'PENDING',
        created_at: createdAt,
        updated_at: createdAt,
        preferred_visit_date: {
          create: this.toPreferredDateRows(referral.preferredSchedules),
        },
      },
    });
    await recordInternalEntry(transaction, {
      target: { visitRequestId: created.id },
      recordedBy: actingCuratorAccountId,
      type: CommunicationType.REFERRAL,
      message: `Created by curator referral from inquiry ${referral.sourceInquiryId}.`,
    });
    await this.recordAudit(transaction, {
      userId: actingCuratorAccountId,
      visitRequestId: created.id,
      action: 'CREATE_VISIT_REQUEST_FROM_REFERRAL',
      details: {
        sourceInquiryId: referral.sourceInquiryId,
        preferredScheduleCount: referral.preferredSchedules.length,
        visitorCount: referral.visitorCount,
      },
    });
    return created.id;
  }

  async findAll(query: ListVisitRequestsQueryDto): Promise<VisitRequest[]> {
    const search = query.search
      ? { contains: query.search, mode: Prisma.QueryMode.insensitive }
      : undefined;
    const items = await this.prisma.visit_request.findMany({
      where: {
        status: query.status,
        ...(search && {
          OR: [
            { contact_person: search },
            { email_address: search },
            { organization_name: search },
            { purpose_of_visit: search },
          ],
        }),
      },
      include: VISIT_REQUEST_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<VisitRequest> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  // Status-only change by a curator (REQ-4.9-09/14), limited to the SRS
  // B.3 transitions and recorded in the request's timeline.
  async update(
    id: string,
    dto: UpdateVisitRequestDto,
    actingCuratorAccountId: string,
  ): Promise<VisitRequest> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        const previousStatus = existing.status as VisitRequestStatus;
        if (previousStatus === (dto.status as VisitRequestStatus)) {
          return this.toEntity(existing);
        }
        assertVisitRequestTransition(previousStatus, dto.status);

        const updated = await transaction.visit_request.update({
          where: { id },
          data: {
            status: dto.status,
            reviewed_by: actingCuratorAccountId,
            updated_at: new Date(),
          },
          include: VISIT_REQUEST_INCLUDE,
        });
        await recordInternalEntry(transaction, {
          target: { visitRequestId: id },
          recordedBy: actingCuratorAccountId,
          type: CommunicationType.STATUS_CHANGE,
          message: describeStatusChange(previousStatus, dto.status, dto.note),
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          visitRequestId: id,
          action: 'UPDATE_VISIT_REQUEST_STATUS',
          details: { previousStatus, status: updated.status },
        });
        return this.toEntity(updated);
      },
      CONFLICT_MESSAGE,
    );
  }

  // Approves one preferred option (REQ-4.9-17). The approved date and time
  // are copied onto the request; every submitted option stays stored.
  async approveSchedule(
    id: string,
    dto: ApproveVisitScheduleDto,
    actingCuratorAccountId: string,
  ): Promise<VisitRequest> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        const previousStatus = existing.status as VisitRequestStatus;
        assertVisitRequestTransition(
          previousStatus,
          VisitRequestStatus.APPROVED_BY_CURATOR,
        );

        const option = existing.preferred_visit_date.find(
          (schedule) => schedule.preference_order === dto.preferenceOrder,
        );
        if (!option) {
          throw new BadRequestException(
            `This visit request has no preferred option ${dto.preferenceOrder}.`,
          );
        }
        const optionDate = this.formatDate(option.preferred_date);
        if (optionDate < this.museumToday()) {
          throw new BadRequestException(
            `Preferred option ${dto.preferenceOrder} is already in the past.`,
          );
        }

        const updated = await transaction.visit_request.update({
          where: { id },
          data: {
            status: VisitRequestStatus.APPROVED_BY_CURATOR,
            approved_date: option.preferred_date,
            approved_start_time: option.preferred_start_time,
            approved_end_time: option.preferred_end_time,
            reviewed_by: actingCuratorAccountId,
            updated_at: new Date(),
          },
          include: VISIT_REQUEST_INCLUDE,
        });
        const approvedLine =
          `Approved option ${dto.preferenceOrder}: ${optionDate} ` +
          `${this.formatTime(option.preferred_start_time)}-` +
          `${this.formatTime(option.preferred_end_time)}.`;
        await recordInternalEntry(transaction, {
          target: { visitRequestId: id },
          recordedBy: actingCuratorAccountId,
          type: CommunicationType.STATUS_CHANGE,
          message: describeStatusChange(
            previousStatus,
            VisitRequestStatus.APPROVED_BY_CURATOR,
            [approvedLine, dto.note].filter(Boolean).join('\n\n'),
          ),
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          visitRequestId: id,
          action: 'APPROVE_VISIT_SCHEDULE',
          details: {
            previousStatus,
            status: updated.status,
            preferenceOrder: dto.preferenceOrder,
          },
        });
        return this.toEntity(updated);
      },
      CONFLICT_MESSAGE,
    );
  }

  // Approved visitor and schedule details in one place for the curator's
  // manual USC campus-entry process (REQ-4.9-12/13).
  async getCampusEntrySummary(id: string): Promise<CampusEntrySummary> {
    const request = this.toEntity(await this.findOneOrThrow(this.prisma, id));
    if (
      !CAMPUS_ENTRY_STATUSES.includes(request.status) ||
      !request.approvedSchedule
    ) {
      throw new BadRequestException(
        'Only an approved visit request has a campus-entry summary.',
      );
    }

    return {
      visitRequestId: request.id,
      status: request.status,
      organization: request.organization,
      contactPerson: request.name,
      email: request.email,
      phone: request.phone,
      purpose: request.purpose,
      approvedSchedule: request.approvedSchedule,
      visitorCount: request.visitorCount,
      visitors: request.visitors,
      vehicles: request.vehicles,
      equipment: request.equipment,
    };
  }

  // Internal curator note, e.g. details the visitor sent to the museum's
  // external mailbox (REQ-4.9-10/14). The note text is not copied into the
  // audit log, which only records that a note was added.
  async addNote(
    id: string,
    dto: CreateInternalNoteDto,
    actingCuratorAccountId: string,
  ): Promise<CommunicationEntry> {
    return this.prisma.$transaction(async (transaction) => {
      await this.findOneOrThrow(transaction, id);
      const entry = await recordInternalEntry(transaction, {
        target: { visitRequestId: id },
        recordedBy: actingCuratorAccountId,
        type: CommunicationType.NOTE,
        message: dto.message,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        visitRequestId: id,
        action: 'ADD_VISIT_REQUEST_NOTE',
        details: { entryId: entry.id },
      });
      return entry;
    });
  }

  async listHistory(id: string): Promise<CommunicationEntry[]> {
    await this.findOneOrThrow(this.prisma, id);
    return listEntries(this.prisma, { visitRequestId: id });
  }

  private assertSchedulesValid(schedules: PreferredScheduleDto[]): void {
    const today = this.museumToday();
    const seen = new Set<string>();

    schedules.forEach((schedule, index) => {
      const label = `preferredSchedules[${index}]`;
      const parsed = this.toDbDate(schedule.date);
      if (this.formatDate(parsed) !== schedule.date) {
        throw new BadRequestException(`${label}.date is not a real date.`);
      }
      if (schedule.date < today) {
        throw new BadRequestException(`${label}.date cannot be in the past.`);
      }
      if (schedule.endTime <= schedule.startTime) {
        throw new BadRequestException(
          `${label}.endTime must be later than startTime.`,
        );
      }

      const key = `${schedule.date} ${schedule.startTime}-${schedule.endTime}`;
      if (seen.has(key)) {
        throw new BadRequestException(`${label} duplicates an earlier option.`);
      }
      seen.add(key);
    });
  }

  private assertVisitorsValid(dto: CreateVisitRequestDto): void {
    if ((dto.visitors?.length ?? 0) > dto.visitorCount) {
      throw new BadRequestException(
        'visitors cannot list more people than visitorCount.',
      );
    }
  }

  private assertVehicleValid(dto: CreateVisitRequestDto): void {
    const hasVehicleDetails =
      dto.plateNumber !== undefined ||
      dto.carBrand !== undefined ||
      dto.carType !== undefined;
    if (hasVehicleDetails && dto.bringingVehicle !== true) {
      throw new BadRequestException(
        'Vehicle details require bringingVehicle to be true.',
      );
    }
  }

  private async findOneOrThrow(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<VisitRequestRecord> {
    const found = await client.visit_request.findUnique({
      where: { id },
      include: VISIT_REQUEST_INCLUDE,
    });
    if (!found) {
      throw new NotFoundException(`Visit request ${id} not found`);
    }
    return found;
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string | null;
      visitRequestId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.visitRequestId,
        affected_record_type: 'visit_request',
        action: params.action,
        module: 'visit-requests',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toPreferredDateRows(schedules: PreferredScheduleDto[]) {
    return schedules.map((schedule, index) => ({
      preferred_date: this.toDbDate(schedule.date),
      preferred_start_time: this.toDbTime(schedule.startTime),
      preferred_end_time: this.toDbTime(schedule.endTime),
      preference_order: index + 1,
    }));
  }

  private museumToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: MUSEUM_TIME_ZONE,
    }).format(new Date());
  }

  // @db.Date and @db.Time columns round-trip through UTC Date objects.
  private toDbDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDbTime(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private formatTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }

  private toEntity(item: VisitRequestRecord): VisitRequest {
    return {
      id: item.id,
      name: item.contact_person,
      email: item.email_address,
      phone: item.contact_number,
      organization: item.organization_name,
      address: item.address,
      purpose: item.purpose_of_visit,
      visitorCount: item.visitor_count,
      preferredSchedules: item.preferred_visit_date.map((schedule) => ({
        date: this.formatDate(schedule.preferred_date),
        startTime: this.formatTime(schedule.preferred_start_time),
        endTime: this.formatTime(schedule.preferred_end_time),
        preferenceOrder: schedule.preference_order,
      })),
      approvedSchedule:
        item.approved_date && item.approved_start_time && item.approved_end_time
          ? {
              date: this.formatDate(item.approved_date),
              startTime: this.formatTime(item.approved_start_time),
              endTime: this.formatTime(item.approved_end_time),
            }
          : null,
      sourceInquiryId: item.source_inquiry_id,
      visitors: item.visit_request_visitor.map((visitor) => ({
        name: visitor.visitor_name,
      })),
      vehicles: item.visit_request_vehicle.map((vehicle) => ({
        plateNumber: vehicle.plate_number,
        brand: vehicle.vehicle_brand,
        type: vehicle.vehicle_type,
      })),
      equipment: item.miscellaneous_details,
      notes: item.additional_notes,
      status: item.status as VisitRequestStatus,
      consentAcceptedAt: item.consent_accepted_at,
      reviewedBy: item.reviewed_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}
