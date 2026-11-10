# Manual synthetic runner probe

Prepared November 10, 2026 against develop
`cab23ab1f511415ae274f1645ed8abd17453e761`.

This optional workflow measures one existing synthetic worker workload on a
standard GitHub-hosted Ubuntu runner. It reuses the owned worker/PostgreSQL and
protected history tests already in ordinary CI; it adds no new application
tests or live backup feature. It does not need provider credentials or local
DPAPI/recovery files. No application `.env` file is copied.

## Before dispatch

- Review and merge the workflow through the normal process. GitHub needs the
  dispatch workflow on the default branch (`main` at assessment time). A merge
  only to `develop` will not make it dispatchable from the ordinary workflow UI.
  Do not change the default branch or release policy just for this probe.
- Confirm the repository owner's budget/usage restrictions. The owner supplied
  a screenshot showing a $0 Actions budget with usage blocked, plus reported $0
  billed. Remaining included capacity and the detailed budget coverage are
  unverified. Keep the budget unchanged; a timeout is not a billing guarantee.
- Existing CI already exercises this small workload. If its recorded durations
  answer the feasibility question, use that evidence instead of consuming an
  additional run. This probe is for an explicitly chosen measurement, not a
  mandatory repeat or a substitute for the eventual hosted workload.
- Check the acknowledgement only when intentionally consuming that bounded
  Actions usage. The job refuses a non-default-branch dispatch. No workflow is
  run by adding, pushing or reviewing the file.

## Run and interpret

In Actions, select **Manual synthetic recovery runner probe**, choose the
default branch and acknowledge synthetic-only execution. The single job has a
12-minute timeout and serial concurrency without cancelling an active run.
It pulls the existing pinned fixture image, installs the lockfile, builds the
worker and runs `test:recovery-worker:db` unchanged. Action dependencies are
pinned to verified v4 commit refs; Node follows the existing Node 22 CI family.

The always-run summary reports the tested revision, elapsed time and sampled
available memory/disk. Samples are not peak usage or billed runtime; setup and
teardown overhead are not a complete capacity model. If the job is cancelled or
killed, a summary may be missing. Record that as unavailable, not success.
Fixture cleanup uses the existing ownership checks; there is no broad Docker
prune or other cleanup command added by this workflow. The ephemeral host is
discarded by GitHub; local and shared application services are not involved.

No artifacts or dependency caches are uploaded by this workflow. Normal CI and
test output still appears in Actions logs; use synthetic fixtures only. Network
access to GitHub, npm and the image registry is needed. This is not an egress
isolation test or a guarantee that arbitrary repository code cannot make requests.

This does **not** prove full-profile Auth/Storage recovery, hosted export,
unattended B2 credential delivery, production consistency, scheduled reliability,
independent key custody, actual museum capacity, or sufficient monthly allowance.
Retain the full-profile local/B2 evidence separately. A green probe cannot promote
BAK-002, enable a schedule or authorize a real-data export.

## Evidence record

Record workflow URL, commit, operator/date, outcome, elapsed seconds, sampled
resources and whether the current CI evidence made an extra run unnecessary.
Compare measured use with all existing account usage and an agreed reserve.
Do not convert elapsed seconds to a claimed free balance or guaranteed price.

Prepared only: no cloud probe was dispatched during local preparation. Validate
workflow/YAML and embedded shell syntax before publication; actual hosted
execution remains unverified until an intentional manual run completes.
