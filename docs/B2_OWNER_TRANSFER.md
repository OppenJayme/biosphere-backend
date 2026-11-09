# Owner-only synthetic checkpoint transfer

Prepared November 9, 2026. This follows #279, #278 and #276; it does not
authorize a live provider run, hosted export or deployment. The default command
prints a plan without accessing files, decrypting credentials or using HTTP:

```powershell
node scripts/recovery/b2-owner-transfer.cjs
```

For the complete finite sequence and stop conditions, use the
[synthetic rehearsal run card](./B2_SYNTHETIC_RUN_CARD.md). Preparing that card
does not record a live result.

## Reviewed operating boundary

The Windows owner must first have the complete three-role DPAPI packet produced
by the owner setup helper in this checkout:
`.recovery-rehearsals/b2-owner-<runId>/test-keys.dpapi`.
The bridge selects only `fixtureWriter`, never the administrative, publisher or
deletion-probe credential. It requires the exact synthetic run prefix, one bucket,
six capabilities, more than ten minutes remaining and at most six hours remaining
(with five seconds of clock allowance). Authorization independently verifies the
provider response against that scope and expiry. The checkpoint engine rechecks
private-bucket/Object Lock settings before transfer.

Run from a trusted, ordinary Node process without diagnostic logging, preloads,
debugger, coverage or TLS key logging. The live modes reject those recognized
runtime settings before decrypting. This is not protection against a compromised
runtime, same-user malware, an administrator or memory inspection.

PowerShell 7 at the fixed Program Files location is the default. Use
`--host windows-powershell` for the fixed Windows PowerShell 5.1 location.
The helper honors execution policy; it does not bypass or change it. No arbitrary
executable, credential, packet path or environment-secret argument is accepted.

After separate live-run authorization, the command shapes are:

```powershell
node scripts/recovery/b2-owner-transfer.cjs --mode publish --run-id <run-uuid> --checkpoints <absolute-checkpoint-directory> --keys <absolute-separate-key-directory> --confirm "PUBLISH ONE SYNTHETIC CHECKPOINT"
node scripts/recovery/b2-owner-transfer.cjs --mode recover --run-id <same-run-uuid> --keys <same-key-directory> --destination <absolute-new-directory> --confirm "RECOVER ONE SYNTHETIC CHECKPOINT"
```

These are argument templates, not commands to run with the angle brackets.
The existing checkpoint format, authenticated transfer receipt, exact-version
download, integrity validation and refusal to overwrite remain authoritative.
Preserve the separate recovery key, proof and receipt. An uncertain upload must
be investigated using the retained receipt; do not clear it to force re-upload.
This tool does not perform a full database/Auth/Storage restore.

## Credential handling and limits

The internal PowerShell helper requires redirected input/output and a nonce
handshake. Only the selected credential travels through its **captured stdout
pipe**, into Node memory. It is not printed to the operator console or placed in
child arguments, environment, public errors or transfer receipts. Do not invoke
the helper manually or capture/print its private pipe. The handshake prevents
accidental console use; it is not a security barrier against the Windows owner.
The child receives a minimal OS environment, without application environment
credentials, profiles or module autoloading. Timeout and output size are bounded.

Decrypted bytes are cleared where practical. JavaScript/PowerShell strings and
runtime copies cannot be guaranteed erased. No cross-account DPAPI recovery,
institutional key custody or recovery after the temporary key expires is proven.
Both modes currently use the temporary fixture writer; this is not a durable
read-only recovery credential design. No scheduler or application endpoint is added.

## Verification

```powershell
node test/b2-owner-bridge.test.cjs
node test/b2-owner-bridge.test.cjs --powershell7
```

Tests create a real CurrentUser DPAPI packet with generated synthetic values,
run the actual PowerShell child, and replace only external Node HTTPS requests.
They publish a synthetic encrypted checkpoint, remove its source files, recover
the exact version and verify it through the existing loader. Negative cases cover
expired/corrupt/partial/broad or wrong-prefix packets, revoked/broadened provider
authorization, invalid confirmations/credential arguments and diagnostic runtime
settings. Public output and private receipts are checked for synthetic canaries.
Windows CI explicitly selects PowerShell 7; local default checks select 5.1.
These checks do not establish live B2 permissions, retention, TLS behavior, a
different Windows account, hosted recovery, deployment readiness or BAK-002 acceptance.
