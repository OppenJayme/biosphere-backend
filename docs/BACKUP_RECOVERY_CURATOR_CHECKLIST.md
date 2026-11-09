# BioSphere backup continuity: Curator checklist

**Proposed, 2026-11-05.** Automation/status features below are not implemented by
this document. Use only after setup, rehearsal and applicable approval. This is
the business-owner companion to the [technical procedure](./BACKUP_RECOVERY_PROCEDURE.md).

**November 8 setup status:** the team selected Backblaze B2 and a tiny encrypted
synthetic upload/readback/private-access probe passed. Continuing storage-account
and key custody, retention protection, actual backup capacity and production
recovery acceptance are not confirmed. The current CI recovery job is a synthetic
test, not a scheduled museum backup. Use the
[closeout order and short decision request](./BACKUP_RECOVERY_APPROVAL.md#closeout-order---november-8-2026)
to finish setup; the ordinary-use steps below remain conditional.

**November 9 update:** a [live synthetic B2 trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md)
showed that a test file locked for one day could not be deleted, and that an
encrypted synthetic backup could be uploaded to B2, downloaded again and used to
restore the whole test system. It used no museum data. Account and key custody,
backup capacity, a schedule, recovery after the lock ends, and recovery of the
museum's real data are still not confirmed.

The full-schema/five-bucket synthetic recovery implementation (#265) is now
merged and has passing CI. That does not establish a scheduled backup of the
museum's actual data or complete the separate rehearsal acceptance and turnover.

## During ordinary use

1. At first use on a museum working day, check the backup status and last
   successful checkpoint date/time, once this status is implemented.
2. **Current:** continue normal work. This means a complete checkpoint passed its
   capture checks, not a promise that every possible disaster is recoverable.
3. **Unknown, failed or overdue:** record the displayed run/time and request
   assistance through the approved contact route. No successful history is not
   healthy. Do not send passwords, visitor records or backup files in a chat.
4. If the website cannot open, use the separately recorded account/support route.
   The website cannot show its own outage. Do not clear browser data: unsynced
   drafts may exist only on that device.

## Keep access recoverable

- Keep approved museum/project account recovery details and MFA recovery access
  in the agreed protected location. Do not depend on a graduating student's
  personal email, phone, GitHub or cloud-storage account.
- When Curators change, hand over approved account/recovery access and this
  checklist; ensure old access is removed through authorized assistance.
- Review provider/account warnings and escalation details periodically. Ask for
  help with expired access, disabled automation or capacity warnings rather than
  attempting technical fixes or enabling paid plans yourself.

## If recovery is needed

1. Describe what is missing/broken and approximately when it last worked.
2. Request an authorized qualified person. There is no guaranteed response time
   or permanently staffed technical support under the $0 proposal.
3. Authorize the business recovery scope and acceptable known data-loss gap.
   Technical support restores into an isolated target and validates it first.
4. Check the recovered specimen/visit/other relevant museum information. Ask the
   technical reviewer to explain any omissions before approving a live cutover.
5. Keep the incident/result reference and ensure normal operation resumes on
   only one authoritative environment. Do not run restore or migration commands.

Curator/business owner: **Pending**. Account custody reference: **Pending**.
Authorized assistance route: **Pending; availability is not promised**.
Approval/turnover record: [complete here](./BACKUP_RECOVERY_APPROVAL.md).
No passwords, secrets or private visitor data belong on this sheet.
