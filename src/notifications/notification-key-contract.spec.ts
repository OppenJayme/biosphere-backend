import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateNotificationStateDto } from './dto/update-notification-state.dto';
import { CuratorNotificationType } from './entities/curator-notification.entity';

// Every alert type the feed emits must be accepted end to end: by the API
// validation and by the database constraint on user_notification_state.
// VISITOR_REPLY once passed the API but failed the constraint, so its alerts
// could never be read, dismissed or cleared.
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');
const RECORD_ID = '0b5c9f3e-6a1d-4c2b-9e7f-1a2b3c4d5e6f';

function latestConstraintTypes(): string[] {
  const latest = readdirSync(MIGRATIONS)
    .sort()
    .map((name) => join(MIGRATIONS, name, 'migration.sql'))
    .map((path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    })
    .filter((sql) => /ADD CONSTRAINT notification_state_key/.test(sql))
    .pop();
  const match = latest?.match(/notification_id ~ '\^\(([A-Z_|]+)\):/);
  if (!match) throw new Error('No notification_state_key migration found');
  return match[1].split('|').sort();
}

describe('notification key contract', () => {
  const types = Object.values(CuratorNotificationType).sort();

  it('the newest database constraint accepts exactly the feed types', () => {
    expect(latestConstraintTypes()).toEqual(types);
  });

  it.each(types)('the API accepts %s keys', (type) => {
    const dto = plainToInstance(UpdateNotificationStateDto, {
      notificationId: `${type}:${RECORD_ID}`,
      state: 'DISMISSED',
    });
    expect(validateSync(dto)).toEqual([]);
  });
});
