import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  Prisma,
  type audit_log,
  type user_role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import {
  AuditActorRole,
  AuditLogEntry,
  AuditLogPage,
  AuditResult,
} from './entities/audit-log.entity';

const AUDIT_LOG_INCLUDE = {
  user_account: {
    select: {
      id: true,
      full_name: true,
      role: true,
    },
  },
} satisfies Prisma.audit_logInclude;

type AuditLogWithActor = audit_log & {
  user_account: {
    id: string;
    full_name: string;
    role: user_role;
  } | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditLogsQueryDto): Promise<AuditLogPage> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.audit_log.findMany({
        where,
        include: AUDIT_LOG_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.audit_log.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<AuditLogEntry> {
    const item = await this.prisma.audit_log.findUnique({
      where: { id },
      include: AUDIT_LOG_INCLUDE,
    });
    if (!item) throw new NotFoundException(`Audit log ${id} not found`);
    return this.toEntity(item);
  }

  private buildWhere(query: ListAuditLogsQueryDto): Prisma.audit_logWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        'The audit-log from timestamp must not be after the to timestamp.',
      );
    }

    const where: Prisma.audit_logWhereInput = {
      status: query.result,
      module: query.module
        ? { equals: query.module, mode: Prisma.QueryMode.insensitive }
        : undefined,
      action: query.action
        ? { equals: query.action, mode: Prisma.QueryMode.insensitive }
        : undefined,
      user_id: query.actorId,
      affected_record_type: query.affectedRecordType
        ? {
            equals: query.affectedRecordType,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      affected_record_id: query.affectedRecordId,
      created_at:
        from || to
          ? {
              gte: from,
              lte: to,
            }
          : undefined,
    };

    if (query.search) where.OR = this.buildSearch(query.search);
    return where;
  }

  private buildSearch(search: string): Prisma.audit_logWhereInput[] {
    const contains = {
      contains: search,
      mode: Prisma.QueryMode.insensitive,
    } as const;
    const conditions: Prisma.audit_logWhereInput[] = [
      { action: contains },
      { module: contains },
      { affected_record_type: contains },
      {
        user_account: {
          is: { full_name: contains },
        },
      },
    ];

    if (isUUID(search)) {
      conditions.push(
        { id: search },
        { user_id: search },
        { affected_record_id: search },
      );
    }
    return conditions;
  }

  private toEntity(item: AuditLogWithActor): AuditLogEntry {
    return {
      id: item.id,
      actor: item.user_account
        ? {
            id: item.user_account.id,
            fullName: item.user_account.full_name,
            role: item.user_account.role as AuditActorRole,
          }
        : null,
      affectedRecordId: item.affected_record_id,
      affectedRecordType: item.affected_record_type,
      action: item.action,
      module: item.module,
      details: item.details,
      result: item.status as AuditResult,
      createdAt: item.created_at,
    };
  }
}
