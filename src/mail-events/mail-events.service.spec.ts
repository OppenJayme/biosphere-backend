import { PrismaService } from '../prisma/prisma.service';
import { parseBrevoEvents } from './brevo-event';
import { MailEventsService } from './mail-events.service';

const ID = '<receipt-1@smtp-relay.mailin.fr>';
const ENTRY = '11111111-1111-4111-8111-111111111111';

describe('MailEventsService', () => {
  const prisma = {
    communication_history: { findFirst: jest.fn(), updateMany: jest.fn() },
  };
  let service: MailEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.communication_history.updateMany.mockResolvedValue({ count: 1 });
    service = new MailEventsService(prisma as unknown as PrismaService);
  });

  it('updates the matching outbound timeline entry', async () => {
    prisma.communication_history.findFirst.mockResolvedValue({
      id: ENTRY,
      delivery_result: `SENT ${ID}`,
    });

    await expect(
      service.apply(parseBrevoEvents({ event: 'delivered', 'message-id': ID })),
    ).resolves.toEqual({ received: 1, updated: 1 });

    expect(prisma.communication_history.findFirst).toHaveBeenCalledWith({
      where: {
        direction: 'OUTBOUND',
        external_message_id: { in: [ID, 'receipt-1@smtp-relay.mailin.fr'] },
      },
      select: { id: true, delivery_result: true },
    });
    // Conditional on the value read, so a racing event cannot be overwritten.
    expect(prisma.communication_history.updateMany).toHaveBeenCalledWith({
      where: { id: ENTRY, delivery_result: `SENT ${ID}` },
      data: { delivery_result: `SENT ${ID} · delivered` },
    });
  });

  it('ignores emails that are not on any timeline, such as curator alerts', async () => {
    prisma.communication_history.findFirst.mockResolvedValue(null);

    await expect(
      service.apply(
        parseBrevoEvents({ event: 'hard_bounce', 'message-id': ID }),
      ),
    ).resolves.toEqual({ received: 1, updated: 0 });
    expect(prisma.communication_history.updateMany).not.toHaveBeenCalled();
  });

  it('leaves a final outcome alone when a late event arrives', async () => {
    prisma.communication_history.findFirst.mockResolvedValue({
      id: ENTRY,
      delivery_result: `SENT ${ID} · delivered`,
    });

    await expect(
      service.apply(parseBrevoEvents({ event: 'deferred', 'message-id': ID })),
    ).resolves.toEqual({ received: 1, updated: 0 });
    expect(prisma.communication_history.updateMany).not.toHaveBeenCalled();
  });
});
