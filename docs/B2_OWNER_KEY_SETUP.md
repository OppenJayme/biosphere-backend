# Owner-run temporary B2 key setup

Prepared November 9, 2026. This helper is for the **dedicated private synthetic
test bucket only**, not production credentials, museum exports or scheduled
backup deployment. The owner reports Object Lock is enabled, with default
retention still unset. Setup independently checks those flags before creating
any key. It does not enable Object Lock, set retention or upload/delete files.

## Review the exact change

The account owner already has an administrative key stored securely. Do not
regenerate it, put it in `backblaze.env`, pass it on a command line, or send it
through chat. The helper prompts for its ID and secret with `Read-Host
-AsSecureString`; neither is deliberately saved or printed. Plaintext is needed
briefly in process memory to authorize HTTPS requests; this is not a guarantee
against a compromised local user/process. Use a trusted local session, not a
remote terminal whose contents are being captured or shared.

Choose the owner runtime explicitly. **PowerShell 7 (`pwsh.exe`) is the primary
documented host because hosted CI verifies it.** Before live creation, run the
credential-free synthetic suite and preview on the owner's actual machine using
that same host. Require every check to pass, with zero skipped:

```powershell
node test/b2-owner-key-setup.test.cjs --powershell7
pwsh.exe -NoProfile -File scripts/recovery/b2-owner-key-setup.ps1
```

If PowerShell 7 is not installed, Windows PowerShell 5.1 is an explicitly
**locally tested alternative, not hosted 5.1 coverage**. No installation is
required by this helper. Immediately before `-Create`, run
`node test/b2-owner-key-setup.test.cjs` (without `--powershell7`) and the preview
with `powershell.exe -NoProfile -File scripts/recovery/b2-owner-key-setup.ps1`.
Proceed only after both pass on the owner's machine. Record date, helper commit,
host and test counts without secrets. Use `powershell.exe` consistently for the
creation and inspection commands below if that is the verified alternative;
do not silently switch hosts between preflight and live use. An earlier local
result or a PowerShell 7 CI pass is not this immediate owner-machine preflight.

The preview neither prompts for credentials nor contacts B2. Live creation is a
separate owner action, after review, using the exact bucket name from the console:

```powershell
pwsh.exe -NoProfile -File scripts/recovery/b2-owner-key-setup.ps1 -Create -BucketName "YOUR-EXACT-PRIVATE-TEST-BUCKET"
```

This requires typing `CREATE THREE TEST KEYS`, then entering the administrative
ID/secret in hidden local prompts. Do not replace the placeholders with secrets
in the command. If local script policy blocks execution, stop and review that
policy; do not weaken a machine-wide setting merely to run the helper.

Only the fixed official B2 authorization endpoint is used initially. The
returned API destination must match an HTTPS `api<digits>.backblazeb2.com` host,
with redirects disabled and bounded request timeouts. The owner-selected bucket
must match the same account, be private, have no lifecycle rules, have enabled
Object Lock and readable/unset default retention. A mismatch or unreadable required setting
stops before creation. Administrative `writeKeys`, `listBuckets` and
`readBucketRetentions` are required; the helper does not elevate an existing key.

Exactly three keys are requested, each expiring after **six hours**, restricted
to that bucket and a new `synthetic/retention-<run-id>/` prefix:

| Role | Exact capabilities | Purpose |
| --- | --- | --- |
| `publisher` | `listBuckets`, `readBucketRetentions`, `readFileRetentions`, `readFiles`, `writeFiles` | Probe upload/readback and ordinary-key denial. No deletion or retention-changing power. |
| `fixtureWriter` | Publisher capabilities plus `writeFileRetentions` | Future consuming code must hard-cap requests to **Governance mode and at most one day (24 hours)** on a newly generated synthetic fixture in this fresh prefix. Refuse Compliance, Legal Hold or a longer/invalid retain-until before sending a request. This is exceptional test authority, not the routine publisher. |
| `deletionProbe` | `listBuckets`, `readBucketRetentions`, `readFileRetentions`, `readFiles`, `deleteFiles` | Test real lock enforcement despite delete permission, without retention changes or governance bypass. |

No generated key gets `writeKeys`, bucket administration, governance bypass or
legal-hold modification. Every returned receipt is checked for the requested
scope, name, capabilities, secret shape and expiry before storing it. This is a
bounded operator setup, not proof that the provider enforces each permission.
See the official [key-creation API](https://www.backblaze.com/apidocs/b2-create-key).

Those mode/duration limits are requirements for the future fixture writer,
not constraints expressible by this key's capability list. This setup creates
keys only and does not implement that consumer or apply a lock. The retention
test must not run until its actual consumer enforces and tests those bounds.
A compromised `fixtureWriter` key can exercise its granted retention capability
inside the prefix during its six-hour lifetime; this is why it is temporary,
separate from the routine publisher and limited to generated test objects.

## Local storage and failure handling

Generated keys and private account/bucket/scope metadata are encrypted with
Windows DPAPI `CurrentUser` before writing beneath
`.recovery-rehearsals/b2-owner-<run-id>/test-keys.dpapi`. That directory is ignored
by Git. The administrative key/token is not included. Only status, role
capabilities/expiry, run ID and counts are printed, never secret values or raw
provider errors. Do not share the packet just because it is encrypted.

This DPAPI packet depends on the current Windows user's profile/key protection.
It is **not** portable institutional escrow or the solution for a runner or
recovery after loss of this account/device. Continuing custody, independent
decryption-key retrieval and production credential storage remain separate work.
The test credentials expiring after six hours is intentional; verifying a
one-day lock's later expiry will require a separately reviewed fresh identity.

After each successful creation, the protected packet is saved. If a later call
times out or returns inconsistent metadata, setup stops, reports a possible
unknown creation outcome and leaves the earlier packet in place. It does not
retry key creation, delete keys, or regenerate the master key. The owner must
review App Keys for `biosphere-test-<role>-<run-id>` before any retry, and revoke
unexpected/partial keys as appropriate. Do not interpret a failure as proof that
no key exists. A filesystem/protection failure after creation can likewise leave
an account-side key requiring owner inspection.

To verify local packet decryption without contacting B2 or displaying secrets:

```powershell
pwsh.exe -NoProfile -File scripts/recovery/b2-owner-key-setup.ps1 -Inspect -RunId "RUN-ID-FROM-THE-RESULT"
```

Metadata inspection does not reauthorize or prove that the keys are still valid,
unchanged or unrevoked. Never hand this packet to routine application code as an
automatic authorization for a live operation.

## Isolated verification

The approved test interface is the real PowerShell script entry point, using
synthetic secure prompts and mocked B2 HTTP responses. Test runs do not read the
user's environment/credential files or contact a provider. They use fresh owned
temporary checkout copies and real current-user DPAPI storage/readback. Windows
CI runs the suite explicitly; Linux would skip this Windows-only tool, so a
Linux pass is not this test's evidence.

```powershell
# Hosted-CI runtime, if installed locally:
node test/b2-owner-key-setup.test.cjs --powershell7
# Windows PowerShell 5.1 owner-machine alternative:
node test/b2-owner-key-setup.test.cjs
```

The default plan and three-role creation flow were observed failing before
implementation, then passing. The initial synthetic HTTP mock had a PowerShell
scope-counter problem; correcting that fixture was not a live B2 defect.
Provider response, wrong-target, missing authorization, disabled/unknown lock,
unexpected default retention, owner-decline and partial-timeout checks are
separate from real-provider acceptance. No live administrative key was used
during preparation; no live key, retention setting, upload or deletion was
created by these tests. Review and CI are required before owner execution.

November 9 local checkpoint: all 15 checks passed, zero skipped, on Windows
Node 22.14.0 and 24.7.0. Added regressions reject reused provider key IDs and
string-valued safety flags; those cases failed before correction. PowerShell
syntax, recommended CJS test lint, test formatting, workflow parsing and diff
checks pass. Pushed-head Windows CI and independent review remain separate.

CI follow-up: run 574 passed the Linux build/recovery jobs but the Windows job
hit its five-minute limit during this suite, without a completed test result.
That cancellation is not passing evidence and does not establish a helper or
provider failure cause. The test launch now closes child stdin and retains the
Windows profile/application-data paths needed by PowerShell/DPAPI, still excluding
application credentials and user Node options. Windows CI invokes the test file
directly so the inner Node test-runner output is not hidden behind another test
process, and has a two-minute step limit. The exact hosted cause and new-head
result must be checked rather than inferred from the local pass.

Run 575 confirmed a 20-second timeout for each child, including plan mode, so
the prior stdin/profile change was insufficient. The next test-host correction
defines PATH and PSModulePath using only the Windows system/PowerShell
directories, retains Windows installation-path variables, and explicitly uses
RemoteSigned for the isolated child process. No user/machine policy or live
helper behavior is changed; domain policies still take precedence. See
[Microsoft's process-policy documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).
A before-hook checks native host startup and the mocked read-only plan. Host
failure stops the suite rather than retrying every case against a broken host;
it never converts failed coverage into a pass. Hosted verification remains
required, and these combined changes do not isolate a single original cause.

Run 578 narrowed the hosted failure: the native Console startup command passed,
but the helper plan invoked through `-Command` timed out. The harness now uses
an owned UTF-8 wrapper file and the same `-File` entry point as the owner command,
with separate native JSON-command and file-entry controls before the helper.
Wrappers contain synthetic fixtures only and are individually removed after
verifying their owned temporary parent. All 15 local checks still pass. This
entry-point change awaits hosted confirmation; it does not relax any helper
scope, permission, credential or retention requirement.

Run 579 isolated the failure further: the Console command passed but a plain
`ConvertTo-Json` command timed out before helper/file execution. The test host
now explicitly imports only the Windows Utility/Management/Security manifests,
disables automatic module discovery and disables the child module-analysis cache
using [Microsoft's documented child settings](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables).
This does not delete or modify the host user's shared cache, install modules,
change machine policy or skip the JSON/control/workflow checks. It tests the
module-loading layer implicated by the hosted control, without claiming a
specific cache corruption cause.

Current hosted verification explicitly selects the runner's preinstalled
PowerShell 7 (`node test/b2-owner-key-setup.test.cjs --powershell7`). The same
15 cases, native JSON/file/plan controls, real DPAPI storage and scope checks
remain enabled; no automatic fallback or skip converts a Windows PowerShell
5.1 failure into a pass. Windows PowerShell 5.1 remains the locally tested host
(`node test/b2-owner-key-setup.test.cjs`). Its Windows Server 2025 module-loading
failure remains unresolved and is not claimed as hosted coverage. A successful
PowerShell 7 result will establish only that explicitly named host's coverage.

The helper can also be invoked with `pwsh.exe -NoProfile -File ...` if PowerShell
7 is already installed; this work does not install or replace the owner's shell.
On that runtime the helper loads the framework's ProtectedData assembly if the
type was not supplied by System.Security. Encryption remains DPAPI CurrentUser,
with no plaintext fallback. Test children import fixed built-in module manifests
and use child-only cache/policy settings; they do not change the owner's global
module path, cache or policy. Approval and actual owner execution remain separate.

November 9 review follow-up: the primary commands now name PowerShell 7, with an
explicit, immediately-before-creation 5.1 preflight for an owner without 7.
The fixture-writer role documents a mandatory Governance/24-hour request bound
in the future consumer, without claiming that B2 capabilities enforce that bound.
Mock authorization/bucket responses now use `PSCustomObject` at every nested
object level, matching `Invoke-RestMethod` property behavior. A missing nested
retention mode must stop before creation. This characterization already failed
closed with the earlier fixture locally; no production defect is inferred from
the fidelity correction. Updated local/CI counts are recorded in the PR.
