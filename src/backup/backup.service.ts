/** Reads backup execution metadata without exposing artifacts or running operations. */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  Prisma,
  type backup_history,
  type user_role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListBackupHistoryQueryDto } from './dto/list-backup-history-query.dto';
import {
  BackupCreatorRole,
  BackupHistoryEntry,
  BackupHistoryPage,
  BackupStatus,
} from './entities/backup-history.entity';

const BACKUP_HISTORY_INCLUDE = {
  user_account: {
    select: {
      id: true,
      full_name: true,
      role: true,
    },
  },
} satisfies Prisma.backup_historyInclude;

type BackupHistoryWithCreator = backup_history & {
  user_account: {
    id: string;
    full_name: string;
    role: user_role;
  } | null;
};

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListBackupHistoryQueryDto): Promise<BackupHistoryPage> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.backup_history.findMany({
        where,
        include: BACKUP_HISTORY_INCLUDE,
        orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.backup_history.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<BackupHistoryEntry> {
    const item = await this.prisma.backup_history.findUnique({
      where: { id },
      include: BACKUP_HISTORY_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException(`Backup history entry ${id} not found`);
    }
    return this.toEntity(item);
  }

  private buildWhere(
    query: ListBackupHistoryQueryDto,
  ): Prisma.backup_historyWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        'The backup-history from timestamp must not be after the to timestamp.',
      );
    }

    const where: Prisma.backup_historyWhereInput = {
      status: query.status,
      backup_type: query.backupType
        ? {
            equals: query.backupType,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      created_by: query.creatorId,
      started_at:
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

  private buildSearch(search: string): Prisma.backup_historyWhereInput[] {
    const contains = {
      contains: search,
      mode: Prisma.QueryMode.insensitive,
    } as const;
    const conditions: Prisma.backup_historyWhereInput[] = [
      { backup_type: contains },
      {
        user_account: {
          is: { full_name: contains },
        },
      },
    ];

    if (isUUID(search)) {
      conditions.push({ id: search }, { created_by: search });
    }
    return conditions;
  }

  private toEntity(item: BackupHistoryWithCreator): BackupHistoryEntry {
    return {
      id: item.id,
      creator: item.user_account
        ? {
            id: item.user_account.id,
            fullName: item.user_account.full_name,
            role: item.user_account.role as BackupCreatorRole,
          }
        : null,
      backupType: item.backup_type,
      status: item.status as BackupStatus,
      artifactAvailable: item.storage_path !== null,
      startedAt: item.started_at,
      completedAt: item.completed_at,
    };
  }
}
