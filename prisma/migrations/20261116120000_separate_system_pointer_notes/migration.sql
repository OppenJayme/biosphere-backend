-- Gives the system pointer note its own type so curator notes need a curator
-- again (review follow-up on 20261116000000_allow_system_communication_entries).
-- That migration allowed a null recorded_by for every INTERNAL / NOTE, because
-- the pointer left on an inquiry when a visitor reply to it is filed on the
-- visit request it was turned into shared the curator note's type. The pointer
-- is now INTERNAL / SYSTEM_NOTE; a curator note (POST .../notes) is rejected
-- again without a curator.
-- Existing pointers are the only INTERNAL / NOTE rows with no curator (the
-- checks before 20261116000000 rejected any other). They are retyped after the
-- old check is dropped (it rejects a null-curator SYSTEM_NOTE) and before the
-- new one is added, so every row satisfies the new check.
-- Deploy: pause the mailbox sync (or stop the app) while this is applied and
-- the matching backend is restarted. Old code writes NOTE pointers that this
-- check rejects, and new code writes SYSTEM_NOTE pointers that the previous
-- check rejects; either failure rolls back the whole reply import.
BEGIN;

ALTER TABLE public.communication_history
  DROP CONSTRAINT communication_recorded_by_unless_system;

UPDATE public.communication_history
  SET communication_type = 'SYSTEM_NOTE'
  WHERE direction = 'INTERNAL'
    AND communication_type = 'NOTE'
    AND recorded_by IS NULL;

ALTER TABLE public.communication_history
  ADD CONSTRAINT communication_recorded_by_unless_system
  CHECK (
    recorded_by IS NOT NULL
    OR direction = 'INBOUND'
    OR (direction = 'OUTBOUND' AND communication_type = 'RECEIPT_EMAIL')
    OR (direction = 'INTERNAL' AND communication_type = 'SYSTEM_NOTE')
  );

COMMIT;
