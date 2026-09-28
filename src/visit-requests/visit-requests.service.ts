import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { ListVisitRequestsQueryDto } from './dto/list-visit-requests-query.dto';
import { PreferredScheduleDto } from './dto/preferred-schedule.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import {
  VisitRequest,
  VisitRequestStatus,
  VisitRequestSubmissionReceipt,
} from './entities/visit-request.entity';

// The museum operates in Philippine time; "today" for past-date checks is
// the current date there, not the server's UTC date.
const MUSEUM_TIME_ZONE = 'Asia/Manila';

const VISIT_REQUEST_INCLUDE = {
  preferred_visit_date: { orderBy: { preference_order: 'asc' } },
  visit_request_visitor: true,
  visit_request_vehicle: true,
} satisfies Prisma.visit_requestInclude;

type VisitRequestRecord = Prisma.visit_requestGetPayload<{
  include: typeof VISIT_REQUEST_INCLUDE;
}>;

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
            create: dto.preferredSchedules.map((schedule, index) => ({
              preferred_date: this.toDbDate(schedule.date),
              preferred_start_time: this.toDbTime(schedule.startTime),
              preferred_end_time: this.toDbTime(schedule.endTime),
              preference_order: index + 1,
            })),
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

  async findAll(query: ListVisitRequestsQueryDto): Promise<VisitRequest[]> {
    const items = await this.prisma.visit_request.findMany({
      where: { status: query.status },
      include: VISIT_REQUEST_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<VisitRequest> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  // Status-only change by a curator (REQ-4.9-09/14).
  async update(
    id: string,
    dto: UpdateVisitRequestDto,
    actingCuratorAccountId: string,
  ): Promise<VisitRequest> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      if (String(existing.status) === String(dto.status)) {
        return this.toEntity(existing);
      }

      const updated = await transaction.visit_request.update({
        where: { id },
        data: {
          status: dto.status,
          reviewed_by: actingCuratorAccountId,
          updated_at: new Date(),
        },
        include: VISIT_REQUEST_INCLUDE,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        visitRequestId: id,
        action: 'UPDATE_VISIT_REQUEST_STATUS',
        details: { previousStatus: existing.status, status: updated.status },
      });
      return this.toEntity(updated);
    });
  }

  async remove(id: string, actingCuratorAccountId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findOneOrThrow(transaction, id);
        // Child rows have no ON DELETE CASCADE, so remove them explicitly.
        await transaction.visit_request_vehicle.deleteMany({
          where: { visit_id: id },
        });
        await transaction.visit_request_visitor.deleteMany({
          where: { visit_id: id },
        });
        await transaction.preferred_visit_date.deleteMany({
          where: { visit_id: id },
        });
        await transaction.visit_request.delete({ where: { id } });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          visitRequestId: id,
          action: 'DELETE_VISIT_REQUEST',
          details: { previousStatus: existing.status },
        });
      });
    } catch (error) {
      // Referenced by communication history.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This visit request has linked records and cannot be deleted.',
        );
      }
      throw error;
    }
  }

  private assertSchedulesValid(schedules: PreferredScheduleDto[]): void {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: MUSEUM_TIME_ZONE,
    }).format(new Date());
    const seen = new Set<string>();

    schedules.forEach((schedule, index) => {
      const label = `preferredSchedules[${index}]`;
      const parsed = this.toDbDate(schedule.date);
      if (parsed.toISOString().slice(0, 10) !== schedule.date) {
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

  // @db.Date and @db.Time columns round-trip through UTC Date objects.
  private toDbDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDbTime(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
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
        date: schedule.preferred_date.toISOString().slice(0, 10),
        startTime: schedule.preferred_start_time.toISOString().slice(11, 16),
        endTime: schedule.preferred_end_time.toISOString().slice(11, 16),
        preferenceOrder: schedule.preference_order,
      })),
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
