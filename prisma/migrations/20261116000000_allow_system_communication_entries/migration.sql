-- Lets BioSphere's own timeline entries have no acting curator.
-- 20261111000000_add_mailbox_reply_sync allowed a null recorded_by only for
-- INBOUND replies, but two system writers also leave it null:
--   - automatic receipts (OUTBOUND / RECEIPT_EMAIL) sent on submission and
--     on referral, REQ-4.8-08 / REQ-4.9-07;
--   - the pointer note (INTERNAL / NOTE) left on an inquiry when a visitor
--     reply to it is filed on the visit request it was turned into.
-- Those inserts failed the check in production, so receipts were emailed but
-- never reached the timeline or the audit log. Curator emails, status changes
-- and referrals still need a curator.
-- Every existing row satisfies the old, stricter check, so it also satisfies
-- this one.
BEGIN;

ALTER TABLE public.communication_history
  DROP CONSTRAINT communication_recorded_by_unless_inbound;
ALTER TABLE public.communication_history
  ADD CONSTRAINT communication_recorded_by_unless_system
  CHECK (
    recorded_by IS NOT NULL
    OR direction = 'INBOUND'
    OR (direction = 'OUTBOUND' AND communication_type = 'RECEIPT_EMAIL')
    OR (direction = 'INTERNAL' AND communication_type = 'NOTE')
  );

COMMIT;
