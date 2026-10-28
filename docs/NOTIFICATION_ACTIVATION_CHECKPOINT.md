# Notification activation checkpoint - 2026-10-28

The per-curator read/dismiss feature is prepared in backend
[#208](https://github.com/OppenJayme/biosphere-backend/pull/208) and frontend
[#91](https://github.com/OppenJayme/biosphere-frontend/pull/91). Both PR CI runs
passed at backend `93d428263341e1f4ffe0ef3cb406622f7f88e957` and frontend
`866d684c52cf13c038367c4c6f700647e29e25d3`. Both PRs remain open at this checkpoint.
They were not included in Voltaire's earlier three-suite independent batch.

## Read-only configured-target check

Using the existing backend configuration internally, a PostgreSQL READ ONLY
transaction inspected schema/migration metadata only. It read no museum or
visitor records, printed no credentials and made no schema or environment change.

| Check | Result |
| --- | --- |
| `NOTIFICATION_STATE_ENABLED` enabled | No |
| `user_notification_state` table exists | No |
| Prisma migration-history table exists | Yes |
| Exact notification migration recorded/finished | No / No |
| Configured runtime role has RLS bypass capability | Yes |

This confirms activation is pending. Role capability alone does not verify the
future table's grants, forced RLS, constraints or deployed API authorization.
Controls will remain hidden until the backend advertises the enabled feature.

## Next finite steps

1. Merge backend #208, then frontend #91 into develop. Merge alone does not
   activate the feature or update the running servers.
2. Deploy the merged code and generated Prisma client with the flag off through
   the agreed deployment process. Active server rebuild/restart is not performed
   by this documentation task.
3. Obtain explicit authorization for the intended database and the exact prepared
   migration `20261028000000_add_user_notification_state`. Review the
   [implementation/rollout guide](https://github.com/OppenJayme/biosphere-backend/blob/feat/notification-state/docs/NOTIFICATION_STATE_GUIDE.md)
   and deployment recovery procedure before applying it. No shared migration has
   been applied by this task.
4. Verify migration completion, table constraints, privileges and forced RLS on
   that target. Confirm the actual backend role and API ownership enforcement.
5. Enable the backend flag and restart only through separately authorized rollout.
   Use agreed test notifications and two curator accounts to verify isolated
   read/dismiss, unchanged source counts, reload persistence, denial and recovery.
   Do not create real visitor submissions or send live email for this check.
6. If rollout fails, turn the flag off using the agreed process; retain state and
   source records. Do not drop the table or alter operational submissions.

The feature's owned database/API and synthetic bell tests already pass; this
checklist does not request their repetition. Deployed login/provider behavior,
full accessibility, dependency-advisory assessment and broader operational
notification coverage remain separate. No claim of production readiness is made.
