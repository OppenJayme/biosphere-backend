"""Generates progress-data.json, progress-report-backend.md and charts.html from
e2e/results.json. Run after e2e/run.mjs: python build_report.py"""
import json
from collections import Counter

from compute import HERE, RESULTS, WEIGHT, endpoint_map, score

LAST = {
    "path": "https://claude.ai/artifact/H59jkW2x9ReBWv76nvJ1af",
    "date": "2026-11-04",
    "claimedPercent": 95,
}
COMMIT = "be0571f"
modules, failures = score()
reqs = [r for m in modules for r in m["requirements"]]
scored = [r for r in reqs if r["status"] != "N/A"]
weight_total = sum(WEIGHT[r["priority"]] for r in scored)
weight_done = sum(WEIGHT[r["priority"]] for r in scored if r["status"] == "Done")
overall = round(100 * weight_done / weight_total, 1)
implied = round(100 * sum(WEIGHT[r["priority"]] for r in scored if r["lastReportStatus"] == "Done") / weight_total, 1)
counts = Counter(r["status"] for r in reqs)
align_req = Counter(r["alignment"] for r in reqs)
align_mod = Counter(m["alignment"] for m in modules)
passed = sum(r["pass"] is True for r in RESULTS)
failed = sum(r["pass"] is False for r in RESULTS)
unclear = sum(r["pass"] is None for r in RESULTS)
gap = round(overall - LAST["claimedPercent"], 1)
endpoints = endpoint_map()

owners = {}
for m in modules:
    for owner in m["owners"]:
        o = owners.setdefault(owner, {"name": owner, "done": 0, "total": 0, "modules": []})
        o["done"] += m["weightDone"]
        o["total"] += m["weightTotal"]
        o["modules"].append(m["key"])
for o in owners.values():
    o["percent"] = round(100 * o["done"] / o["total"], 1)


def ids(*names):
    found = [r["id"] for r in RESULTS if r["pass"] is False and any(n in r["name"] for n in names)]
    return ", ".join(found) or "n/a"


def tid(name):
    return next(r["id"] for r in RESULTS if name in r["name"])


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


# ---- progress-data.json ------------------------------------------------------
data = {
    "side": "backend",
    "lastReport": LAST,
    "modules": [{
        "name": m["name"], "owner": m["owner"], "percent": m["percent"],
        "lastReportPercent": m["lastReportPercent"], "lastReportStatus": m["lastReportStatus"],
        "alignment": m["alignment"],
        "requirements": [{k: r[k] for k in ("srsId", "status", "lastReportStatus", "alignment", "testsPassed", "testsFailed")} for r in m["requirements"]],
    } for m in modules],
}
(HERE / "progress-data.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf8")

# ---- progress-report-backend.md ----------------------------------------------
summary_rows = [[m["name"], m["owner"], f'{m["percent"]}%', f'{m["weightDone"]}/{m["weightTotal"]}',
                 m["testsPassed"], m["testsFailed"], f'{m["lastReportPercent"]}%', m["alignment"]] for m in modules]

module_sections = []
for m in modules:
    rows = [[r["srsId"], r["title"], r["priority"], r["status"], f'{r["testsPassed"]} / {r["testsFailed"]}', m["owner"], r["note"]]
            for r in m["requirements"]]
    module_sections.append(f'### {m["name"]}: {m["percent"]}%\n\n' + table(
        ["Requirement", "Title", "Priority", "Status", "Tests pass / fail", "Owner", "Note"], rows))

compare_rows = [[m["name"], m["lastReportStatus"], f'{m["lastReportPercent"]}%', m["status"], f'{m["percent"]}%',
                 f'{round(m["percent"] - m["lastReportPercent"], 1):+}', m["alignment"]] for m in modules]
diff_rows = [[r["srsId"], r["title"], r["lastReportStatus"], r["status"], r["alignment"]]
             for r in reqs if r["alignment"] in ("Overstated", "Understated")]
no_endpoint = [[r["srsId"], r["title"], r["status"], r["note"]] for r in reqs
               if r["status"] == "Not Started" or r["srsId"] in {"REQ-4.1-05", "REQ-4.1-09", "REQ-4.1-10"}]
frontend_only = ", ".join(r["srsId"] for r in reqs if r["status"] == "N/A")
endpoint_rows = [[f'`{e["route"]}`', ", ".join(x.replace("REQ-", "") for x in e["reqs"]) or "none",
                  e["noSrs"] or "", e["happy"], e["invalid"], e["db"], e["matrix"], e["failed"]] for e in endpoints]
no_srs_rows = [[f'`{e["route"]}`', e["noSrs"]] for e in endpoints if e["noSrs"]]
owner_rows = [[o["name"], f'{o["percent"]}%', f'{o["done"]}/{o["total"]}', ", ".join("§" + k for k in o["modules"])] for o in owners.values()]

md = f"""# BioSphere backend progress report

**Date:** 2026-11-05 · **Commit:** `develop` @ `{COMMIT}` · **SRS:** v0.10, section 4 · **Compared with:** frontend progress report, 4 Nov 2026

## Result

**The backend meets {overall}% of the SRS requirements it is responsible for.** {counts["Done"]} of {len(scored)} backend requirements are Done, {counts["Partial"]} are Partial and {counts["Not Started"]} are Not Started. Another {counts["N/A"]} requirements have no backend behavior and are left out of the score.

Tests: **{passed} passed, {failed} failed, {unclear} inconclusive** across all 140 API operations. All {failed} failures are real gaps or defects. The largest gap is backup and restore. The most urgent defect is in onboarding: a curator invited by a Developer gets full access before setting a password.

**The last progress report is not an accurate picture of the backend.** It claimed {LAST["claimedPercent"]}%; the verified figure is {overall}%, a gap of {gap} points. It is a frontend report, so its sections do not measure the backend. See [Comparison with Last Progress Report](#comparison-with-last-progress-report).

### How the percentage is calculated

```
Module % = sum of weights of Done requirements / sum of weights of backend requirements x 100
Overall % = the same formula across all modules
Weight: High = 2, Medium = 1. Partial and Not Started earn 0. Frontend-only requirements are excluded.
Overall = {weight_done} / {weight_total} = {overall}%
```

A requirement is Done only when every test tagged to it passes, Partial when some pass and some fail, and Not Started when nothing exists. REQ-4.15-07 is scored Not Started by hand: one adjacent check passes, but no backups exist to protect.

## Module summary

{table(["Module", "Owner", "Verified %", "Weight done", "Tests passed", "Tests failed", "Last report %", "Alignment"], summary_rows)}

Module test counts group each call by the module that owns its endpoint. Requirement rows below count a check once per tagged requirement, so they do not add up to the totals here.

### Progress by owner

{table(["Owner", "Verified %", "Weight done", "Modules"], owner_rows)}

A shared module counts in full for each owner. Owners come from `docs/ACCEPTANCE_TEST_PLAN.md` section 3. `CLAUDE.md` says ownership is not the latest Git author, so Git was used only as a cross-check. The acceptance plan has no line for §4.2 Developer functions; it is listed under Voltaire because it falls under their authentication and WebAR assignments, the 4 Nov report assigns it to them, and they wrote 17 of its 27 commits (GitHub `Raidiniom`). No module is Unassigned.

## How this was tested

Everything ran locally on a throwaway stack, and no shared data was touched.

| Item | Setup |
| --- | --- |
| Server | Current source compiled outside the repo, so `dist/` is unchanged; started from a folder with no `.env` |
| Database | Fresh Supabase Postgres 17 in Docker, stored in memory; all 10 repo migrations applied cleanly |
| Auth | Real GoTrue with real signed tokens, not mocks |
| Storage | Real Supabase Storage, with uploads confirmed in `storage.objects` |
| Email | Hardcoded Brevo URL redirected to a local sink, so sends and forced failures could be inspected; GoTrue mail went to Mailpit |
| Network | A preload script blocked every non-loopback connection; 0 attempts were recorded |
| Database checks | `pg` queries after each write confirmed the change reached the database |

Every route was called with no JWT, a garbage JWT, an expired JWT and a forged signature, and protected routes also with an inactive account and the wrong role. Every route that takes input then got unknown IDs, malformed IDs, bad queries or malformed JSON, and none returned a 5xx.

The repo's own suites also pass with hosted values overridden: **unit 715/715, e2e 445 passed and 17 skipped (the opt-in live Developer suite), `tsc` clean.** The e2e run used a 30-second timeout, so it says nothing about the 28 Oct QR test timing issue.

### What this does not prove

- **Hosted settings were not read.** Invite and reset expiry, email templates, signup settings and RLS on the hosted Supabase project are unverified.
- **Real Brevo delivery was not tested.** The backend's email path works, but BBT's delivery failure on the hosted environment may have its own cause.
- **The feature flags were turned on.** `FAQ_REVIEW_ENABLED` and `NOTIFICATION_STATE_ENABLED` were `true` for this run. `.env.example` has them off and your local `.env` does not set the notification flag, so REQ-4.3-07 answers 503 under that configuration.
- **Local GoTrue differs from hosted behavior in one way.** It stores a random hash for invited users, so the "password not set" guard could not be tested ({tid('onboarding cannot finish')}). The guard reads a provider-internal column (`auth.service.ts:140`), which is a risk at the next provider upgrade.
- **Nonfunctional requirements are out of scope.** SRS section 5 was not tested, so the 28 Oct response-time concern is still open.
- **The disposable `test:*:db` suites were not run.** Their pinned Postgres image is not on this machine. The stack here covers the same ground at the HTTP level but does not replace their concurrency checks.
- **Done means this test pass found no gap.** It is not acceptance sign-off. Every module's sign-off is still Pending, and REQ-4.4-21 is waiting on a Curator/SRS decision (CAT-014).

## Requirements by module

{chr(10).join(s + chr(10) for s in module_sections)}
## Defects found

| # | Severity | Requirement | Defect | Tests | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | High | REQ-4.2-02 | A curator invited through `POST /developer/curators/onboard` gets full curator access from the invite link before setting a password. The Developer path never sets the `onboarding_pending` flag that the curator path sets (`developer.service.ts:114`). | {ids("developer-invited curator")} | Voltaire |
| 2 | Medium | REQ-4.2-05 | The API accepts and activates GLB models that reference external files. That check exists only in the frontend (`src/features/developer/glb.ts`); the backend checks extension, size and magic bytes. | {ids("external buffer", "external texture", "incompatible model")} | Voltaire |
| 3 | Medium | REQ-4.6-12 | No allowed parent-child type rules: a Room can be created inside a Box. Self and descendant cycles are correctly refused. | {ids("invalid parent-child")} | Kyer, Ivan |
| 4 | Low | REQ-4.2-02 | Onboarding the email of a pending invitee returns 500 and says "invitation was sent". An existing active account correctly gets a client error. | {ids("pending invitee rejected")} | Voltaire |
| 5 | Low | REQ-4.2-02 | `GET /developer/curators` shows pending invitations as `ACTIVE`. Carried over from 28 Oct. | {ids("pending invitation is distinguishable")} | Voltaire |

No code was changed in this run. Missing features are listed under [Work remaining](#work-remaining).

## Code to SRS map

### SRS requirements with no endpoint

{table(["Requirement", "Title", "Status", "Note"], no_endpoint)}

**Frontend only, no endpoint expected ({counts["N/A"]}):** {frontend_only}.

### Endpoints with no SRS requirement

{table(["Endpoint", "Why it exists"], no_srs_rows)}

Report type `AUDIT_LOG` on `POST /reports` is also extra: SRS 4.7.4 approves five report types, and this is a sixth.

### All 140 endpoints

Columns count checks per endpoint: happy path, invalid input, database or storage confirmation, and auth matrix (missing, invalid, expired or forged JWT, inactive account, wrong role).

{table(["Endpoint", "SRS (REQ-)", "No SRS reason", "Happy", "Invalid", "DB", "Auth", "Failed"], endpoint_rows)}

## How each conflict was settled

The progress reports and the BBT disagree in these places. BBT ran on 27-28 Oct through the UI against the hosted database. This test ran on 5 Nov through the API. What the code does today decides each one.

| Requirement | Progress report says | BBT says | Code does today | Settled |
| --- | --- | --- | --- | --- |
| REQ-4.3-07 mark read or dismissed | 4 Nov: §4.3 gap is only the bell's feed; 6 Oct: no read state | Fail (BB-DSH-07): no control | Read and dismiss work per curator and leave records untouched, with the flag on | **Done.** Shipped 28 Oct (#208), the same day BBT finished. Off by default |
| REQ-4.3-09, 4.8-08, 4.9-07 email alerts | 4 Nov: §4.8 and §4.9 at 100% | Fail (BB-DSH-06): alert email failed | Sends to active curators only, records failures honestly | **Done** in code. BBT's failure was delivery in that environment. Retest on hosted Brevo |
| REQ-4.4-20, 4.4-21 import preview | 4 Nov: §4.4 at 100% | Fail (BB-IMP-02): same-species row not warned | Same scientific and common name warns. Same species alone reports nothing, as the written duplicate rule requires | **Done.** BBT expected more than the rule. The rule itself still needs Curator disposition |
| REQ-4.6-11 capacity warning | 6 Oct: warnings exist; 4 Nov: §4.6 at 100% | Fail (BB-SPC-08): no warning shown | API returns `capacityWarning` with the excess | **Done** for the backend. Check whether the frontend displays it |
| REQ-4.2-05 AR validation | 4 Nov: §4.2 at 100% | Pass (BB-AR-04, 05) | API accepts and activates external-reference models | **Partial.** Both overstated it: BBT saw the frontend's error message, not a backend check |
| REQ-4.2-02 onboarding | 4 Nov: §4.2 at 100%, yet lists pending shown as Active | Pass (BB-DEV-01) | Three defects on the Developer path | **Partial** |
| REQ-4.6-12 parent-child rules | 6 Oct: no type matrix; 4 Nov: §4.6 at 100% | Pass (BB-STO-03, cycles only) | Still no matrix | **Partial.** The 4 Nov 100% is wrong for the backend |
| REQ-4.1-08, 4.1-09 activation, handover | 4 Nov: no screens; 6 Oct: no routes | Fail (BB-USR-04) | No curator route; Developer-only status change | **Not Started** and **Partial.** Sources agree. Invitations exist, so 4.1-09 has one half |
| REQ-4.1-16, 4.1-18 change password | 4 Nov: no page | Fail (BB-USR-05) | No route, audit or confirmation email | **Not Started.** Sources agree |
| REQ-4.15-05, 4.15-06 backup | 4 Nov: history only, §4.15 at 83% | Not Verified (BB-AUD-04) | Read-only history; nothing writes it | **Not Started** and **Partial.** The 83% is a frontend figure |
| REQ-4.4-19 XLSX import | 7 Oct: XLSX rejected | Pass (BB-IMP-01, 03), and BB-IMP-04 expected non-CSV files to be refused | XLSX preview works | **Done.** Added 29 Oct (#216), after BBT. BB-IMP-04 needs updating |
| REQ-4.4-10 restore | 6 Oct and 7 Oct: no restore route | Archive Pass (BB-SPC-19); restore not covered | Restore works and keeps public display off | **Done.** Added 21 Oct; the SRS does not require it |
| REQ-4.5-11 lot history | 28 Oct: 500 on `TEMPORARY_ABSENCE` | Not covered | History returns that row | **Done.** Fixed 2 Nov (#221) |
| REQ-4.4-01 duplicate collections | 6 Oct: accepted (DEF-001) | Not covered | Case and padding variants get 409 | **Done** |

## Comparison with Last Progress Report

**Report compared:** BioSphere frontend progress report, 3-4 Nov 2026 ([link]({LAST["path"]})), the link you provided. No Progress Report exists in the repo or `/docs`, and this is the latest one found. It claims {LAST["claimedPercent"]}%.

**Limits of this comparison:**

- **It is a frontend report.** It scores each section's frontend share, so a gap here does not mean the frontend score is wrong.
- **It has no requirement rows.** Requirement statuses are inferred: a section at 100% counts as Done, and a section below 100% counts as Done except for the gaps it names (for example REQ-4.1-08). This is why Not in report is 0.
- **Other reports have no backend percentage.** The 28 Oct System Test Report covers the backend at `edaf18c` but gives counts only. The 6 Oct "11 of 16 complete" counted code that exists, and the 7 Oct review already called that overstated.

### Verdict

**Not accurate for the backend.**

| Measure | Value |
| --- | --- |
| Overall % claimed | {LAST["claimedPercent"]}% (frontend) |
| Actual overall % now | {overall}% (backend) |
| Gap | {gap} points |
| Same claims scored with the backend formula | {implied}%, so {round(implied - overall, 1)} points above actual |

| Category | Requirement rows | Module rows |
| --- | --- | --- |
| Aligned | {align_req["Aligned"]} | {align_mod["Aligned"]} |
| Overstated | {align_req["Overstated"]} | {align_mod["Overstated"]} |
| Understated | {align_req["Understated"]} | {align_mod["Understated"]} |
| Not in report | 0 | 0 |
| Not applicable (frontend only) | {align_req["Not applicable"]} | 0 |

The overall gap is modest, but it hides where the risk is. §4.15 is the clearest case: its status is Aligned because both are Partial, yet the report says 83% and the backend is {next(m["percent"] for m in modules if m["key"] == "4.15")}%.

### By module

{table(["Module", "Report status", "Report %", "Verified status", "Verified %", "Gap", "Alignment"], compare_rows)}

### Rows that differ

{table(["Requirement", "Title", "Report (inferred)", "Verified", "Alignment"], diff_rows)}

**The other {align_req["Aligned"]} requirement rows are Aligned.** The full list is in `progress-data.json`.

### Real progress or reporting error

- **Overstated rows are reporting errors, not regressions.** Git shows no backend commit after 4 Nov, and each gap was already in the code on the report date.
- **The one Understated row is valid.** The curator invitation behind REQ-4.1-09 was added on 7 Oct (`45548ff`), before the report date.
- **Real backend progress since 28 Oct:** notification read state (#208), XLSX import (#216), lot-history repair (#221), multiple vehicles (#223), visit reference on inquiries (#228), report layout (#227) and archive-consistent duplicate checks (#230).

### 28 Oct System Test Report issues, rechecked

| Issue | Now |
| --- | --- |
| High: lot history returns 500 | Fixed |
| Medium: responses over 3 seconds | Not retested (nonfunctional, and this stack has no network distance) |
| Low: pending invitations shown as Active | Still open, defect 5 |
| Low: QR test timing | Not settled, because this run used a longer timeout |
| Question: two active GLB models on one exhibit | Still allowed; the SRS does not say either way ({tid('more than one active')}) |

## Blockers

| Blocker | Blocks | Needs | Owner |
| --- | --- | --- | --- |
| No backup job, restore procedure or full test | REQ-4.15-05 to -09, -11, and turnover | USC/DCISM approval of server, schedule and destination | Kyer, with USC/DCISM |
| No approved backup plan | REQ-4.15-12 | USC/DCISM decision | USC/DCISM |
| Curators cannot activate, deactivate or hand over | REQ-4.1-08, -09 | Team decision on the procedure, as the 4 Nov report notes | Voltaire |
| Allowed storage type matrix not written | REQ-4.6-12 | Agreed matrix | Kyer, Ivan |
| Duplicate archive exclusion undecided | CAT-014 acceptance | Curator/SRS disposition | Kyer, Curator |
| Hosted settings unverified | REQ-4.1-19 expiry; Brevo delivery | Read-only check by someone with hosted access | Voltaire |

## Work remaining

Delivery plan dates: features 8 Nov, completion 18 Nov.

**Fix now**

1. Set `onboarding_pending` on the Developer invite path (defect 1). Voltaire.
2. Validate GLB structure in the backend, on upload and activation (defect 2). Voltaire.
3. Return a clean conflict for pending invitees, and expose invitation state to Developers (defects 4, 5). Voltaire.

**Build**

4. Curator activate, deactivate and handover routes, with audit. Voltaire.
5. Change-password route with audit and confirmation email; audit recovery and reset. Voltaire.
6. Inactivity timeout, with the approved period. Voltaire, with the frontend.
7. Sync-failure notification source, or an agreed decision that it stays client-side. Charles, John.
8. Storage type matrix and enforcement. Kyer, Ivan.
9. Backup job, failure alert, restore procedure, audit entries and one full backup-and-restore test. Kyer.

**Confirm**

10. Set `NOTIFICATION_STATE_ENABLED` where acceptance and the demo run.
11. Decide whether Swagger at `/docs` stays public in production ({tid('Swagger UI')}).
12. Decide whether `AUDIT_LOG`, tags and FAQ review should be added to the SRS.
13. Check whether the frontend shows `capacityWarning`.

## Rerun

Needs Docker Desktop and Git Bash. Nothing here reads the repo's `.env`.

```bash
bash docs/progress-report-backend/harness/up.sh
```

```bash
bash docs/progress-report-backend/harness/server.sh
```

In a second terminal:

```bash
node docs/progress-report-backend/e2e/run.mjs
```

```bash
cd docs/progress-report-backend && python build_report.py
```

To remove the stack:

```bash
bash docs/progress-report-backend/harness/down.sh
```

Raw results for every check are in `e2e/results.json`.
"""
(HERE / "progress-report-backend.md").write_text(md, encoding="utf8")

# ---- charts.html -------------------------------------------------------------
chart_data = {
    "overall": overall, "claimed": LAST["claimedPercent"], "gap": gap, "commit": COMMIT,
    "passed": passed, "failed": failed, "unclear": unclear,
    "status": [{"name": k, "count": counts[k]} for k in ("Done", "Partial", "Not Started", "N/A")],
    "modules": [{k: m[k] for k in ("key", "name", "owner", "percent", "lastReportPercent", "status", "alignment", "testsPassed", "testsFailed")} for m in modules],
    "owners": sorted(({"name": o["name"], "percent": o["percent"], "modules": ", ".join("§" + k for k in o["modules"])} for o in owners.values()), key=lambda o: o["percent"]),
}
template = (HERE / "charts.template.html").read_text(encoding="utf8")
(HERE / "charts.html").write_text(template.replace("__DATA__", json.dumps(chart_data)), encoding="utf8")
print("overall", overall, "implied", implied, dict(counts), dict(align_req), dict(align_mod), passed, failed, unclear)
