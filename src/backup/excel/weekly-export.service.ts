import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readSheet } from 'read-excel-file/node';
import { Prisma, type backup_history } from '../../generated/prisma/client';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../../supabase/supabase.constants';
import { EXPORT_FIELD_SET, type ExportFieldSet } from './export-field-set';
import {
  EXPORT_RELATIONS,
  loadExportSheets,
  manilaDateTime,
  type ExportRelation,
  type ExportSheet,
} from './export-sheets';
import {
  buildXlsx,
  MAX_CELL_CHARS,
  TRUNCATION_MARK,
  type XlsxCell,
  type XlsxSheet,
} from '../../common/excel/xlsx-writer';

export const WEEKLY_EXPORT_TYPE = 'WEEKLY_EXCEL_EXPORT';
export const MANUAL_EXPORT_TYPE = 'MANUAL_EXCEL_EXPORT';
export const EXPORT_BUCKET = 'weekly-exports';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MANILA_OFFSET_MS = 8 * 60 * MINUTE_MS; // Asia/Manila has no DST.
const STALE_AFTER_MS = 30 * MINUTE_MS; // AC-1b
const MAX_ATTEMPTS = 3; // AC-1b
const OVERDUE_AFTER_MS = 8 * DAY_MS; // AC-1c
const CHECK_EVERY_MS = 10 * MINUTE_MS;
const FIRST_CHECK_AFTER_MS = MINUTE_MS;
const DEFAULT_SCHEDULE = 'SAT 18:00';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ABOUT_SHEET = 'About';

export type ExportFailureCode =
  | 'DB_READ_FAILED'
  | 'COUNT_MISMATCH'
  | 'FIELD_MISMATCH'
  | 'RELATION_MISMATCH'
  | 'WRITE_FAILED'
  | 'UPLOAD_FAILED'
  | 'READBACK_FAILED'
  | 'INTERRUPTED';

/** A failure with a fixed code; never carries row values (AC-6). */
export class ExportFailure extends Error {
  constructor(readonly code: ExportFailureCode) {
    super(code);
    this.name = 'ExportFailure';
  }
}

export interface ExportSchedule {
  day: number;
  hour: number;
  minute: number;
}

/** "SAT 18:00" → day 6, 18:00. Invalid values fall back to the default. */
export function parseSchedule(value: string | undefined): ExportSchedule {
  const match = /^\s*([A-Za-z]{3})\s+(\d{1,2}):(\d{2})\s*$/.exec(
    value ?? DEFAULT_SCHEDULE,
  );
  const day = match ? DAYS.indexOf(match[1].toUpperCase()) : -1;
  const hour = match ? Number(match[2]) : NaN;
  const minute = match ? Number(match[3]) : NaN;
  if (day < 0 || !(hour >= 0 && hour < 24) || !(minute >= 0 && minute < 60)) {
    return parseSchedule(DEFAULT_SCHEDULE);
  }
  return { day, hour, minute };
}

/** Today's date in Manila, "YYYY-MM-DD". */
export function manilaToday(now: Date): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The most recent scheduled slot at or before `now`, as its Manila date.
 * Every scheduled export belongs to exactly one such date (AC-1).
 */
export function latestSlotDate(now: Date, schedule: ExportSchedule): string {
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  const slot = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      schedule.hour,
      schedule.minute,
    ),
  );
  slot.setUTCDate(
    slot.getUTCDate() - ((local.getUTCDay() - schedule.day + 7) % 7),
  );
  if (slot > local) slot.setUTCDate(slot.getUTCDate() - 7);
  return slot.toISOString().slice(0, 10);
}

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

export interface ExportEntry {
  id: string;
  type: 'WEEKLY' | 'MANUAL';
  exportDate: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  rowCounts: Record<string, number> | null;
  truncatedCounts: Record<string, number> | null;
  fileBytes: number | null;
  fileSha256: string | null;
  fieldSetVersion: string | null;
  failureCode: string | null;
  attempt: number | null;
  downloadable: boolean;
  expired: boolean;
  startedBy: string | null;
}

export interface ExportOverview {
  enabled: boolean;
  schedule: string;
  timeZone: string;
  nextExportDate: string;
  overdue: boolean;
  lastCompletedAt: Date | null;
  lastFailure: { at: Date; code: string | null } | null;
  retentionWeeks: number | null;
  fieldSet: Pick<ExportFieldSet, 'version' | 'status' | 'note'>;
  items: ExportEntry[];
}

export interface ExportFile {
  body: Buffer;
  fileName: string;
}

type Row = backup_history & { user_account: { full_name: string } | null };

/**
 * Weekly Excel export (spec 0003). Reads one read-only snapshot, writes a
 * workbook, reads it back to check rows, headers, relationships and
 * truncation, then stores it in a private bucket. Records and alerts hold
 * counts, codes and hashes only, never row values.
 */
@Injectable()
export class WeeklyExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyExportService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  onModuleInit(): void {
    // Tests load the same .env; a test run must never write exports.
    if (!this.isEnabled() || this.config.get('NODE_ENV') === 'test') return;
    const first = setTimeout(
      () => void this.checkSchedule(),
      FIRST_CHECK_AFTER_MS,
    );
    const every = setInterval(() => void this.checkSchedule(), CHECK_EVERY_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  isEnabled(): boolean {
    return this.config.get<string>('EXCEL_EXPORT_ENABLED') === 'true';
  }

  private schedule(): ExportSchedule {
    return parseSchedule(this.config.get<string>('EXCEL_EXPORT_SCHEDULE'));
  }

  private scheduleLabel(): string {
    const s = this.schedule();
    return `${DAYS[s.day]} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  }

  private retentionWeeks(): number | null {
    const raw = this.config.get<string>('EXCEL_EXPORT_RETENTION_WEEKS');
    const weeks = raw ? Number(raw) : NaN;
    return Number.isInteger(weeks) && weeks >= 1 ? weeks : null;
  }

  /**
   * Scheduler tick, also the catch-up after downtime (AC-1, AC-1b): runs the
   * latest slot's export once if it has no completed export yet.
   */
  async checkSchedule(now = new Date()): Promise<void> {
    try {
      await this.markStaleRuns(now);
      const exportDate = latestSlotDate(now, this.schedule());
      const date = toDbDate(exportDate);
      const done = await this.prisma.backup_history.count({
        where: {
          backup_type: WEEKLY_EXPORT_TYPE,
          export_date: date,
          status: 'COMPLETED',
        },
      });
      if (done) return;
      const attempts = await this.prisma.backup_history.count({
        where: { backup_type: WEEKLY_EXPORT_TYPE, export_date: date },
      });
      if (attempts >= MAX_ATTEMPTS) return;
      await this.run(WEEKLY_EXPORT_TYPE, exportDate, null, attempts + 1);
    } catch (error) {
      // A held lock or a failed run is already recorded; never crash the API.
      if (!(error instanceof ConflictException)) {
        this.logger.warn(`Scheduled export check failed: ${describe(error)}`);
      }
    }
  }

  /** A curator's "Run export now" (AC-1a: refused while one is running). */
  async runNow(accountId: string): Promise<ExportEntry> {
    await this.markStaleRuns(new Date());
    const id = await this.run(
      MANUAL_EXPORT_TYPE,
      manilaToday(new Date()),
      accountId,
      1,
    );
    return this.toEntry(await this.findRow(id));
  }

  /** AC-1b: a run left IN_PROGRESS by a restart becomes INTERRUPTED. */
  async markStaleRuns(now: Date): Promise<void> {
    await this.prisma.backup_history.updateMany({
      where: {
        export_date: { not: null },
        status: 'IN_PROGRESS',
        started_at: { lt: new Date(now.getTime() - STALE_AFTER_MS) },
      },
      data: {
        status: 'FAILED',
        failure_code: 'INTERRUPTED',
        completed_at: now,
      },
    });
  }

  private async run(
    type: string,
    exportDate: string,
    accountId: string | null,
    attempt: number,
  ): Promise<string> {
    let row: backup_history;
    try {
      // The IN_PROGRESS row is the lock: a unique partial index allows only
      // one running export, across processes (AC-1a).
      row = await this.prisma.backup_history.create({
        data: {
          backup_type: type,
          status: 'IN_PROGRESS',
          export_date: toDbDate(exportDate),
          attempt,
          created_by: accountId,
          field_set_version: EXPORT_FIELD_SET.version,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An export is already running. Try again in a few minutes.',
        );
      }
      throw error;
    }

    let uploadedPath: string | null = null;
    try {
      const generatedAt = new Date();
      const sheets = await this.readSnapshot();
      const { workbook, rowCounts, expectedTruncated } = this.buildWorkbook(
        sheets,
        exportDate,
        generatedAt,
      );
      await this.verifyWorkbook(workbook, sheets, rowCounts, expectedTruncated);

      const path = `${exportDate.slice(0, 4)}/BioSphere-export-${exportDate}${
        type === MANUAL_EXPORT_TYPE ? `-manual-${row.id.slice(0, 8)}` : ''
      }.xlsx`;
      await this.upload(path, workbook);
      uploadedPath = path;

      await this.prisma.backup_history.update({
        where: { id: row.id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          storage_path: path,
          row_counts: rowCounts,
          truncated_counts: expectedTruncated,
          file_bytes: BigInt(workbook.length),
          file_sha256: createHash('sha256').update(workbook).digest('hex'),
        },
      });
      await this.applyRetention();
      return row.id;
    } catch (error) {
      const code: ExportFailureCode =
        error instanceof ExportFailure ? error.code : 'WRITE_FAILED';
      this.logger.error(
        `Excel export ${row.id} failed: ${code} (${describe(error)})`,
      );
      if (uploadedPath) {
        await this.supabase.storage
          .from(EXPORT_BUCKET)
          .remove([uploadedPath])
          .catch(() => undefined);
      }
      await this.prisma.backup_history
        .update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failure_code: code,
            completed_at: new Date(),
          },
        })
        .catch(() => undefined);
      await this.sendFailureAlert(exportDate, code);
      if (type === MANUAL_EXPORT_TYPE) {
        throw new InternalServerErrorException(
          `The export failed (${code}). Nothing was saved; see Backup History.`,
        );
      }
      return row.id;
    }
  }

  /** One read-only, repeatable-read snapshot of every sheet (AC-2). */
  private async readSnapshot(): Promise<ExportSheet[]> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return loadExportSheets(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          maxWait: 10_000,
          timeout: 120_000,
        },
      );
    } catch (error) {
      if (error instanceof ExportFailure) throw error;
      throw new ExportFailure('DB_READ_FAILED');
    }
  }

  /** Applies the personal-data gate (AC-2a) and counts rows (AC-3). */
  buildWorkbook(
    sheets: ExportSheet[],
    exportDate: string,
    generatedAt: Date,
    fieldSet: ExportFieldSet = EXPORT_FIELD_SET,
  ): {
    workbook: Buffer;
    rowCounts: Record<string, number>;
    expectedTruncated: Record<string, number>;
    headers: Record<string, string[]>;
  } {
    const allowed = new Set(fieldSet.personalColumns);
    const rowCounts: Record<string, number> = {};
    const headers: Record<string, string[]> = {};
    const dataSheets: XlsxSheet[] = sheets.map((sheet) => {
      if (sheet.rows.length !== sheet.sourceCount) {
        throw new ExportFailure('COUNT_MISMATCH');
      }
      const columns = sheet.columns.filter(
        (c) => !c.personal || allowed.has(`${sheet.name}.${c.label}`),
      );
      rowCounts[sheet.name] = sheet.rows.length;
      headers[sheet.name] = columns.map((c) => c.label);
      return {
        name: sheet.name,
        header: headers[sheet.name],
        rows: sheet.rows.map((row) => columns.map((c) => c.value(row))),
      };
    });
    const included = sheets.flatMap((s) =>
      s.columns
        .filter((c) => c.personal && allowed.has(`${s.name}.${c.label}`))
        .map((c) => `${s.name}.${c.label}`),
    );

    // Truncation is decided by the writer; build once to learn the counts,
    // then write them on the About sheet (AC-3c).
    const probe = buildXlsx(dataSheets);
    const about: XlsxSheet = {
      name: ABOUT_SHEET,
      header: ['Item', 'Value'],
      rows: [
        ['System', 'BioSphere, USC Biological Museum'],
        ['Export date', exportDate],
        ['Generated at (Asia/Manila)', manilaDateTime(generatedAt)],
        [
          'BioSphere version',
          this.config.get<string>('BIOSPHERE_VERSION') ?? 'not recorded',
        ],
        ['Field set version', fieldSet.version],
        ['Field set status', fieldSet.status],
        ['Field set note', fieldSet.note],
        [
          'Approved by',
          fieldSet.approvedBy
            ? `${fieldSet.approvedBy} (${fieldSet.role ?? 'role not recorded'}), ${fieldSet.date}`
            : 'Not yet approved',
        ],
        ['Personal-data columns included', included.join(', ') || 'None'],
        ...dataSheets.map((s): XlsxCell[] => [
          `Rows: ${s.name}`,
          rowCounts[s.name],
        ]),
        ...dataSheets.map((s): XlsxCell[] => [
          `Cells cut at ${MAX_CELL_CHARS} characters: ${s.name}`,
          probe.truncated[s.name],
        ]),
        [
          'Not included',
          'Photos and other media files, inquiry attachments and AR assets; user accounts and sign-in data; the audit log and revision history; FAQ content; internal sync and notification tables. These belong to the separate recovery backup.',
        ],
        [
          'Handling',
          'Contains visitor personal data. Keep downloaded copies only on museum-owned storage, in line with the Data Privacy Act of 2012 (RA 10173).',
        ],
      ],
    };
    const { body } = buildXlsx([about, ...dataSheets]);
    const expectedTruncated = Object.fromEntries(
      dataSheets.map((s) => [s.name, probe.truncated[s.name]]),
    );
    return { workbook: body, rowCounts, expectedTruncated, headers };
  }

  /** Reads the file back: rows, headers, relationships, truncation (AC-3 to AC-3c). */
  async verifyWorkbook(
    workbook: Buffer,
    sheets: ExportSheet[],
    rowCounts: Record<string, number>,
    expectedTruncated: Record<string, number>,
    fieldSet: ExportFieldSet = EXPORT_FIELD_SET,
    relations: ExportRelation[] = EXPORT_RELATIONS,
  ): Promise<void> {
    const allowed = new Set(fieldSet.personalColumns);
    const read: Record<string, { header: string[]; rows: unknown[][] }> = {};
    for (const sheet of sheets) {
      let rows: unknown[][];
      try {
        rows = await readSheet(workbook, sheet.name);
      } catch {
        throw new ExportFailure('READBACK_FAILED');
      }
      const header = (rows[0] ?? []).map((v) =>
        typeof v === 'string' ? v : '',
      );
      const expected = sheet.columns
        .filter((c) => !c.personal || allowed.has(`${sheet.name}.${c.label}`))
        .map((c) => c.label);
      if (
        header.length !== expected.length ||
        header.some((h, i) => h !== expected[i])
      ) {
        throw new ExportFailure('FIELD_MISMATCH');
      }
      const body = rows.slice(1);
      if (body.length !== rowCounts[sheet.name]) {
        throw new ExportFailure('COUNT_MISMATCH');
      }
      const cut = body
        .flat()
        .filter(
          (v) =>
            typeof v === 'string' &&
            v.length === MAX_CELL_CHARS &&
            v.endsWith(TRUNCATION_MARK),
        ).length;
      if (cut !== expectedTruncated[sheet.name]) {
        throw new ExportFailure('READBACK_FAILED');
      }
      read[sheet.name] = { header, rows: body };
    }

    for (const relation of relations) {
      const child = read[relation.sheet];
      const parent = read[relation.parentSheet];
      if (!child || !parent) throw new ExportFailure('RELATION_MISMATCH');
      const col = child.header.indexOf(relation.column);
      const parentCol = parent.header.indexOf(relation.parentColumn);
      if (col < 0 || parentCol < 0)
        throw new ExportFailure('RELATION_MISMATCH');
      const ids = new Set(parent.rows.map((r) => r[parentCol]));
      for (const row of child.rows) {
        const ref = row[col];
        if (ref !== null && ref !== undefined && ref !== '' && !ids.has(ref)) {
          throw new ExportFailure('RELATION_MISMATCH');
        }
      }
    }
  }

  /** Private bucket only (AC-4); refuses to write into a public one. */
  private async upload(path: string, workbook: Buffer): Promise<void> {
    const storage = this.supabase.storage;
    const { data: bucket, error: getError } =
      await storage.getBucket(EXPORT_BUCKET);
    if (getError || !bucket) {
      const { error } = await storage.createBucket(EXPORT_BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: [XLSX_MIME],
      });
      if (error) throw new ExportFailure('UPLOAD_FAILED');
    } else if (bucket.public) {
      throw new ExportFailure('UPLOAD_FAILED');
    }
    const { error } = await storage
      .from(EXPORT_BUCKET)
      .upload(path, workbook, { contentType: XLSX_MIME, upsert: false });
    if (error) throw new ExportFailure('UPLOAD_FAILED');
  }

  /**
   * AC-9: only with an approved retention. Deletes files of completed
   * exports beyond the newest N weeks; their history rows stay as expired.
   */
  private async applyRetention(): Promise<void> {
    const weeks = this.retentionWeeks();
    if (!weeks) return;
    const cutoff = new Date(Date.now() - weeks * 7 * DAY_MS);
    const old = await this.prisma.backup_history.findMany({
      where: {
        export_date: { lt: cutoff },
        status: 'COMPLETED',
        expired_at: null,
        storage_path: { not: null },
      },
      select: { id: true, storage_path: true },
    });
    for (const item of old) {
      const { error } = await this.supabase.storage
        .from(EXPORT_BUCKET)
        .remove([item.storage_path!]);
      if (error) continue;
      await this.prisma.backup_history.update({
        where: { id: item.id },
        data: { expired_at: new Date() },
      });
    }
  }

  /** AC-7: date and code only, never data. */
  private async sendFailureAlert(
    exportDate: string,
    code: string,
  ): Promise<void> {
    const to = this.config.get<string>('BACKUP_ALERT_EMAIL');
    if (!to) return;
    const page = `${this.config.get<string>('FRONTEND_URL') ?? ''}/backup-history`;
    const text = `The BioSphere Excel export for ${exportDate} failed (${code}). No file was saved. Open Backup History for details: ${page}`;
    await this.mail
      .send({
        to,
        subject: `BioSphere export failed (${exportDate})`,
        text,
        html: `<p>The BioSphere Excel export for ${exportDate} failed (<strong>${code}</strong>). No file was saved.</p><p><a href="${page}">Open Backup History</a></p>`,
      })
      .catch(() => undefined);
  }

  async overview(now = new Date()): Promise<ExportOverview> {
    const rows = await this.prisma.backup_history.findMany({
      where: { export_date: { not: null } },
      include: { user_account: { select: { full_name: true } } },
      orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    const lastCompleted = await this.prisma.backup_history.findFirst({
      where: { export_date: { not: null }, status: 'COMPLETED' },
      orderBy: { started_at: 'desc' },
      select: { started_at: true },
    });
    const lastFailed = rows.find((r) => r.status === 'FAILED');
    const latestIsFailure =
      lastFailed &&
      (!lastCompleted || lastFailed.started_at > lastCompleted.started_at);
    const schedule = this.schedule();
    // The next slot is the latest slot of a moment one week ahead, unless
    // the current one has not happened yet this week.
    const next = latestSlotDate(new Date(now.getTime() + 7 * DAY_MS), schedule);
    return {
      enabled: this.isEnabled(),
      schedule: this.scheduleLabel(),
      timeZone: 'Asia/Manila',
      nextExportDate: next,
      // AC-1c: worked out on read, independent of the scheduler.
      overdue:
        !lastCompleted ||
        now.getTime() - lastCompleted.started_at.getTime() > OVERDUE_AFTER_MS,
      lastCompletedAt: lastCompleted?.started_at ?? null,
      lastFailure: latestIsFailure
        ? { at: lastFailed.started_at, code: lastFailed.failure_code }
        : null,
      retentionWeeks: this.retentionWeeks(),
      fieldSet: {
        version: EXPORT_FIELD_SET.version,
        status: EXPORT_FIELD_SET.status,
        note: EXPORT_FIELD_SET.note,
      },
      items: rows.map((row) => this.toEntry(row)),
    };
  }

  /** The stored file, checked against its recorded SHA-256. */
  async readFile(id: string): Promise<ExportFile> {
    const row = await this.findRow(id);
    if (row.expired_at)
      throw new GoneException(
        'This export has been removed under the retention policy.',
      );
    if (row.status !== 'COMPLETED' || !row.storage_path) {
      throw new NotFoundException('This export has no file.');
    }
    const { data, error } = await this.supabase.storage
      .from(EXPORT_BUCKET)
      .download(row.storage_path);
    if (error || !data) {
      throw new InternalServerErrorException(
        'The export file could not be read.',
      );
    }
    const body = Buffer.from(await data.arrayBuffer());
    if (createHash('sha256').update(body).digest('hex') !== row.file_sha256) {
      throw new InternalServerErrorException(
        'The export file does not match its recorded checksum.',
      );
    }
    return { body, fileName: row.storage_path.split('/').pop()! };
  }

  /** Download audit entries (AC-5a): ids and sizes only. */
  async audit(
    action:
      | 'EXPORT_DOWNLOAD_STARTED'
      | 'EXPORT_DOWNLOAD_SENT'
      | 'EXPORT_DOWNLOAD_ABORTED',
    exportId: string,
    accountId: string,
    details: Record<string, string | number> = {},
  ): Promise<void> {
    await this.prisma.audit_log
      .create({
        data: {
          user_id: accountId,
          affected_record_id: exportId,
          affected_record_type: 'backup_history',
          module: 'backup',
          action,
          status: action === 'EXPORT_DOWNLOAD_ABORTED' ? 'FAILED' : 'SUCCESS',
          details,
        },
      })
      .catch((error) =>
        this.logger.warn(`Export audit failed: ${describe(error)}`),
      );
  }

  private async findRow(id: string): Promise<Row> {
    const row = await this.prisma.backup_history.findFirst({
      where: { id, export_date: { not: null } },
      include: { user_account: { select: { full_name: true } } },
    });
    if (!row) throw new NotFoundException('Export not found.');
    return row;
  }

  private toEntry(row: Row): ExportEntry {
    return {
      id: row.id,
      type: row.backup_type === MANUAL_EXPORT_TYPE ? 'MANUAL' : 'WEEKLY',
      exportDate: row.export_date
        ? row.export_date.toISOString().slice(0, 10)
        : null,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      rowCounts: (row.row_counts as Record<string, number> | null) ?? null,
      truncatedCounts:
        (row.truncated_counts as Record<string, number> | null) ?? null,
      fileBytes: row.file_bytes === null ? null : Number(row.file_bytes),
      fileSha256: row.file_sha256,
      fieldSetVersion: row.field_set_version,
      failureCode: row.failure_code,
      attempt: row.attempt,
      downloadable:
        row.status === 'COMPLETED' && !!row.storage_path && !row.expired_at,
      expired: !!row.expired_at,
      startedBy: row.user_account?.full_name ?? null,
    };
  }
}

// Error type and code only: database messages can quote row values.
function describe(error: unknown): string {
  if (error instanceof ExportFailure) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return `${error.name} ${error.code}`;
  return error instanceof Error ? error.name : 'unknown error';
}
