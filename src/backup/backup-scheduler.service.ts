import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nextScheduledBackup } from './backup-policy';
import { BackupRunnerService, BackupType } from './backup-runner.service';

/**
 * Runs scheduled backups at the proposed museum-local times. Off unless
 * `BACKUP_SCHEDULE_ENABLED=true`, so tests, local development, and extra
 * instances never start backups on their own. Run it on one instance only.
 */
@Injectable()
export class BackupSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BackupSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private nextRun: Date | null = null;

  constructor(
    private readonly runner: BackupRunnerService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('BACKUP_SCHEDULE_ENABLED') === 'true';
  }

  get nextRunAt(): Date | null {
    return this.nextRun;
  }

  onApplicationBootstrap(): void {
    if (this.enabled) this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(now = new Date()): void {
    this.nextRun = nextScheduledBackup(now);
    const delay = Math.max(this.nextRun.getTime() - Date.now(), 1_000);
    this.logger.log(`Next scheduled backup at ${this.nextRun.toISOString()}`);
    this.timer = setTimeout(() => void this.fire(), delay);
    this.timer.unref?.();
  }

  private async fire(): Promise<void> {
    try {
      await this.runner.run(BackupType.SCHEDULED, null);
    } catch (error) {
      this.logger.error(
        `Scheduled backup did not run: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.scheduleNext();
    }
  }
}
