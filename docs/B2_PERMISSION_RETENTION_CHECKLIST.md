# B2 permission and retention verification

Prepared November 8, 2026. This is the next bounded synthetic test plan, not
permission to change a bucket, create privileged keys, delete existing objects
or export museum data. The team's initial encrypted-byte probe is recorded in
[PR #273](https://github.com/OppenJayme/biosphere-backend/pull/273); that probe
did not establish retention protection or least-privilege operation.

## Accounts and identities

The account owner keeps administrative credentials outside application/runner
configuration. Do not give a routine uploader `writeKeys`, bucket-setting,
retention-changing, legal-hold-changing, deletion or governance-bypass powers.
The console Read/Write preset is not the intended production permission set.

For the next synthetic Native API publisher check, propose these capabilities
only: `listBuckets`, `readBucketRetentions`, `readFileRetentions`, `readFiles`,
and `writeFiles`. They allow checking the selected bucket/default policy,
uploading a generated object, checking its retention and reading that version
back. Add `listFiles` only if the actual inventory/reconciliation design needs
it; it is not needed merely to download a known file ID. The final production
identity must be derived from its actual operations, not copied unexamined from
this temporary test profile.

Restrict the temporary key to one explicitly selected private test bucket and
the `synthetic/` prefix, with a short expiry. Keep a separate read-only recovery
identity and a separately authorized retention-cleanup identity. Neither a
bucket-restricted key nor a read-only key proves independent account custody.

The [Native API key-creation operation](https://www.backblaze.com/apidocs/b2-create-key)
supports an explicit capability list, bucket restrictions, prefix and expiry.
It requires `writeKeys`, which is administrative authority; do not add that
capability to the current probe key. If the console offers only Read/Write
presets, the owner must use an approved administrative setup method. Do not
paste an account/master key into chat, Git, command arguments or logs just to
work around the console's limits. No key creation is performed by this plan.

## Retention setup decision before any change

Ask the owner which controls the console actually exposes. Do not assume that
an ordinary-console duration selector means Governance mode: Backblaze's
[ordinary-console instructions](https://www.backblaze.com/docs/cloud-storage-enable-object-lock-or-a-legal-hold-on-an-existing-bucket)
describe Compliance mode, while the
[Object Lock API documentation](https://www.backblaze.com/docs/cloud-storage-object-lock)
describes both Governance and Compliance.

Enabling Object Lock on a bucket cannot be undone. In Compliance mode even an
administrator cannot remove the active protection before expiry. Therefore,
prepare an explicit owner-reviewed test setting first. A one-day synthetic
retention window is proposed, not applied. Use only tiny generated objects;
leave Legal Hold unset. Do not change default retention on a bucket containing
museum data or enable an indefinite hold as a test.

Enabling Object Lock alone does not lock uploads. Default retention applies to
new uploads after it is configured; it does not retroactively protect the
181-byte object from the first probe. That object must not be relabelled as
retention-tested. Locked versions consume quota until they can be removed.

## Finite provider checks after authorization

1. Read authorization metadata. Verify the exact bucket restriction, prefix,
   expiry, required capabilities and absence of extra capabilities. Reject
   wildcard/all-bucket access, unknown shapes and broadened privileges.
2. Read the bucket metadata. Require a private bucket, enabled Object Lock and
   a readable default mode/duration matching the approved test setting. A
   filtered/unreadable retention field is an unknown, never a pass.
3. Generate one encrypted fixture under 1 KiB using a unique synthetic name;
   keep its key separately. Upload once, retain its immutable file ID and verify
   returned retention metadata/expiry, authenticated bytes/hash/decryption and
   anonymous denial. Do not retry an unknown upload outcome automatically.
4. With the routine identity, attempt deletion of that exact owned synthetic
   version and require a capability/authorization denial. Read the version back
   afterward. An unrelated timeout/404/5xx is not successful protection evidence.
5. Separately test Object Lock enforcement using a deliberately temporary test
   identity with `deleteFiles` but no retention-changing or bypass capability.
   It must be unable to delete the same actively locked synthetic version.
   Verify version/retention readback afterward. Do not infer lock enforcement
   solely from a key that cannot delete any object in the first place.
6. Test the hiding caveat: `writeFiles` includes `b2_hide_file`. If hiding is
   exercised, restrict it to the new synthetic name and verify that the captured
   file ID still retrieves the locked original. Latest-name reads alone are
   not a recovery strategy. Preserve the receipt; do not hide an existing object.
7. After expiry, reauthorize the narrowly scoped cleanup and verify removal of
   the exact synthetic version only. This is a later observation, not something
   a same-day suite can claim. A 24-hour test key may expire first; do not extend
   or replace it silently. Production cleanup must additionally preserve the
   last verified usable checkpoint and approved legal holds.

Permission rejection, lock enforcement, expiry and final recovery are distinct
claims. Do not mark the whole plan passed from a single denied request. A
wrong-bucket operation must be denied before any write; do not create or probe
another person's bucket to manufacture that control.

## Cost, reporting and scope

Inspect the actual account's quota and caps before further live testing. Stay
with a bounded count of sub-1-KiB synthetic files; do not add a payment method,
paid service, replication or event-notification delivery. Backblaze's
[caps guidance](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts)
notes that not all transaction classes have caps, so alerts alone do not prove
zero possible charges. No provider billing guarantee is established here.

Reports contain stage/outcome, tested mode, sizes and denial status/code only.
Keep application keys, encryption keys, account/bucket IDs, file IDs and full
receipts in ignored private material. Retain evidence for ambiguous outcomes;
do not delete it merely to make a rerun clean. Do not log response headers or
raw provider errors, which can expose request metadata.

An isolated local checker, if implemented, will assess supplied sanitized
metadata only. Its tests can establish rejection behavior, not actual B2
enforcement. This plan leaves museum-source access, intended-source restore,
institutional approval, continuing custody, runner deployment, schedule,
production retention and BAK-002 open.
