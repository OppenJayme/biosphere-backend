import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isAllowedPushEndpoint } from './push-endpoint';
import { parseVapidKeys, vapidAuthorization, type VapidKeys } from './vapid';

// Devices one curator may register; registering another drops the oldest.
export const MAX_DEVICES_PER_ACCOUNT = 10;
// How long a push service keeps an undelivered alert for an offline device.
const PUSH_TTL_SECONDS = 3600;
const SEND_TIMEOUT_MS = 10_000;

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

// Web Push for curator alerts (spec 0004). Every push is empty: the device
// fetches the curator's own feed and shows the alert from there, so nothing
// about a visitor ever passes through a browser vendor's push service
// (REQ-4.3-08). Sending never throws, so a push problem cannot fail the
// submission or reply import that triggered it.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly keys: VapidKeys | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const enabled = config.get<string>('PUSH_NOTIFICATIONS_ENABLED') === 'true';
    this.keys = enabled
      ? parseVapidKeys(
          config.get<string>('VAPID_PUBLIC_KEY'),
          config.get<string>('VAPID_PRIVATE_KEY'),
          config.get<string>('VAPID_SUBJECT'),
        )
      : null;
    if (enabled && !this.keys) {
      this.logger.warn(
        'PUSH_NOTIFICATIONS_ENABLED is true but the VAPID keys or subject are missing or invalid; push stays off.',
      );
    }
  }

  getConfig(): PushConfig {
    return {
      enabled: this.keys !== null,
      publicKey: this.keys?.publicKey ?? null,
    };
  }

  // Registers this browser for the signed-in curator. An endpoint belongs to
  // one browser, so re-registering it moves it to whoever is signed in now.
  async subscribe(accountId: string, endpoint: string): Promise<void> {
    this.requireEnabled();
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new BadRequestException('This push service is not supported.');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.push_subscription.upsert({
        where: { endpoint },
        create: { user_account_id: accountId, endpoint },
        update: {
          user_account_id: accountId,
          failure_count: 0,
          created_at: new Date(),
        },
      });
      const devices = await transaction.push_subscription.findMany({
        where: { user_account_id: accountId },
        select: { id: true },
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: MAX_DEVICES_PER_ACCOUNT,
      });
      if (devices.length > 0) {
        await transaction.push_subscription.deleteMany({
          where: { id: { in: devices.map((device) => device.id) } },
        });
      }
    });
  }

  // Removes this browser only if it belongs to the signed-in curator.
  async unsubscribe(accountId: string, endpoint: string): Promise<void> {
    await this.prisma.push_subscription.deleteMany({
      where: { endpoint, user_account_id: accountId },
    });
  }

  // Wakes every device of every active curator. Never throws.
  async notifyCurators(reason: string): Promise<void> {
    const keys = this.keys;
    if (!keys) return;
    try {
      const devices = await this.prisma.push_subscription.findMany({
        where: {
          user_account: { role: 'CURATOR', status: 'ACTIVE' },
        },
        select: { id: true, endpoint: true },
      });
      await Promise.all(devices.map((device) => this.send(keys, device)));
    } catch (error) {
      this.logger.warn(`Push for ${reason} failed: ${describe(error)}`);
    }
  }

  private async send(
    keys: VapidKeys,
    device: { id: string; endpoint: string },
  ): Promise<void> {
    // Stored endpoints were checked on registration; check again in case
    // the allowlist has since been narrowed.
    if (!isAllowedPushEndpoint(device.endpoint)) {
      await this.forget(device.id);
      return;
    }
    try {
      const response = await fetch(device.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(keys, device.endpoint),
          TTL: String(PUSH_TTL_SECONDS),
          Urgency: 'high',
          'Content-Length': '0',
        },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        redirect: 'error',
      });
      if (response.status === 404 || response.status === 410) {
        // The browser unsubscribed or the subscription expired.
        await this.forget(device.id);
      } else if (response.ok) {
        await this.prisma.push_subscription.update({
          where: { id: device.id },
          data: { last_success_at: new Date(), failure_count: 0 },
        });
      } else {
        await this.recordFailure(device.id, `HTTP ${response.status}`);
      }
    } catch (error) {
      await this.recordFailure(device.id, describe(error));
    }
  }

  private async recordFailure(id: string, reason: string): Promise<void> {
    this.logger.warn(`Push to a registered device failed: ${reason}`);
    await this.prisma.push_subscription
      .update({ where: { id }, data: { failure_count: { increment: 1 } } })
      .catch(() => undefined);
  }

  private async forget(id: string): Promise<void> {
    await this.prisma.push_subscription
      .deleteMany({ where: { id } })
      .catch(() => undefined);
  }

  private requireEnabled(): void {
    if (!this.keys) {
      throw new ServiceUnavailableException(
        'Push notifications are not enabled.',
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
