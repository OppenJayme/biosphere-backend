import { gzipSync } from 'node:zlib';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { selectBackupsToPrune } from './backup-policy';
import { BackupService } from './backup.service';
import { BackupHistoryEntry } from './entities/backup-history.entity';

export enum BackupType {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

const DEFAULT_BACKUP_BUCKET = 'system-backups';
const BACKUP_FORMAT = 'biosphere-logical-backup/v1';
// A run still IN_PROGRESS after this long is treated as abandoned.
const STALE_RUN_MS = 30 * 60 * 1000;

interface BackupSnapshot {
  format: string;
  createdAt: string;
  tables: Record<string, unknown[]>;
}

/**
 * Takes a logical snapshot of every BioSphere application table (the
 * `public` schema; Supabase-managed `auth` is backed up by Supabase itself),
 * stores it gzipped in a private storage bucket, records the run in
 * `backup_history`, then removes artifacts outside the retention policy.
 * History rows are never deleted; pruned rows just lose their artifact.
 */
@Injectable()
export class BackupRunnerService {
  private readonly logger = new Logger(BackupRunnerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: BackupService,
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  get bucket(): string {
    return (
      this.config.get<string>('BACKUP_BUCKET')?.trim() || DEFAULT_BACKUP_BUCKET
    );
  }

  async run(
    type: BackupType,
    createdBy: string | null,
    now = new Date(),
  ): Promise<BackupHistoryEntry> {
    if (this.running || (await this.hasActiveRun(now))) {
      throw new ConflictException(
        'A backup is already running. Wait for it to finish, then try again.',
      );
    }
    this.running = true;
    const record = await this.prisma.backup_history.create({
      data: {
        backup_type: type,
        created_by: createdBy,
        status: 'IN_PROGRESS',
        started_at: now,
      },
    });

    try {
      const snapshot = await this.takeSnapshot(now);
      const path = `${now.toISOString().slice(0, 10).replace(/-/g, '/')}/${record.id}.json.gz`;
      await this.upload(path, gzipSync(JSON.stringify(snapshot)));
      await this.prisma.$transaction([
        this.prisma.backup_history.update({
          where: { id: record.id },
          data: {
            status: 'COMPLETED',
            storage_path: path,
            completed_at: new Date(),
          },
        }),
        this.prisma.audit_log.create({
          data: {
            user_id: createdBy,
            affected_record_id: record.id,
            affected_record_type: 'backup_history',
            action: 'RUN_BACKUP',
            module: 'backup',
            details: {
              backupType: type,
              tables: Object.keys(snapshot.tables).length,
              rows: Object.values(snapshot.tables).reduce(
                (total, rows) => total + rows.length,
                0,
              ),
            },
            status: 'SUCCESS',
          },
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Backup ${record.id} failed: ${message}`);
      await this.prisma.$transaction([
        this.prisma.backup_history.update({
          where: { id: record.id },
          data: { status: 'FAILED', completed_at: new Date() },
        }),
        this.prisma.audit_log.create({
          data: {
            user_id: createdBy,
            affected_record_id: record.id,
            affected_record_type: 'backup_history',
            action: 'RUN_BACKUP',
            module: 'backup',
            details: { backupType: type, error: message.slice(0, 500) },
            status: 'FAILED',
          },
        }),
      ]);
    } finally {
      this.running = false;
    }

    await this.pruneExpired(now);
    return this.history.findOne(record.id);
  }

  /** Removes artifacts outside the retention policy. Never throws. */
  async pruneExpired(now = new Date()): Promise<number> {
    try {
      const completed = await this.prisma.backup_history.findMany({
        where: { status: 'COMPLETED', storage_path: { not: null } },
        select: { id: true, started_at: true, storage_path: true },
      });
      const prune = selectBackupsToPrune(
        completed.map((item) => ({
          id: item.id,
          startedAt: item.started_at,
          path: item.storage_path as string,
        })),
        now,
      );
      if (prune.length === 0) return 0;

      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove(prune.map((item) => item.path));
      if (error) throw new Error(error.message);
      await this.prisma.backup_history.updateMany({
        where: { id: { in: prune.map((item) => item.id) } },
        data: { storage_path: null },
      });
      return prune.length;
    } catch (error) {
      this.logger.warn(
        `Backup retention pruning failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private async hasActiveRun(now: Date): Promise<boolean> {
    const active = await this.prisma.backup_history.count({
      where: {
        status: 'IN_PROGRESS',
        started_at: { gte: new Date(now.getTime() - STALE_RUN_MS) },
      },
    });
    return active > 0;
  }

  private async takeSnapshot(now: Date): Promise<BackupSnapshot> {
    // One REPEATABLE READ transaction so every table is read at the same
    // instant and the snapshot is internally consistent.
    return this.prisma.$transaction(
      async (transaction) => {
        const tables = await transaction.$queryRaw<{ table_name: string }[]>(
          Prisma.sql`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
              AND table_name NOT LIKE '\\_prisma%'
            ORDER BY table_name`,
        );
        const snapshot: BackupSnapshot = {
          format: BACKUP_FORMAT,
          createdAt: now.toISOString(),
          tables: {},
        };
        for (const { table_name: table } of tables) {
          const rows = await transaction.$queryRawUnsafe<{ data: unknown[] }[]>(
            `SELECT coalesce(json_agg(t), '[]'::json) AS data FROM public."${table.replace(/"/g, '""')}" t`,
          );
          snapshot.tables[table] = rows[0]?.data ?? [];
        }
        return snapshot;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 120_000,
      },
    );
  }

  private async upload(path: string, body: Buffer): Promise<void> {
    const storage = this.supabase.storage;
    const { error: bucketError } = await storage.getBucket(this.bucket);
    if (bucketError) {
      const { error } = await storage.createBucket(this.bucket, {
        public: false,
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new Error(`Could not prepare backup storage: ${error.message}`);
      }
    }
    const { error } = await storage.from(this.bucket).upload(path, body, {
      contentType: 'application/gzip',
      upsert: false,
    });
    if (error) {
      throw new Error(`Could not store the backup file: ${error.message}`);
    }
  }
}
