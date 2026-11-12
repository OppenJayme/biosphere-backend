# Deployed FAQ assistant check — 2026-11-11

Target: `https://biosphere.dcism.org/`, using the real public Museum Assistant
widget in a separate unsigned-in Edge session. Six distinct questions and one
repeat of the large-group question were submitted. Each public ask response
returned HTTP 200. No inquiry, visit request, consented review submission or FAQ
management mutation was submitted. Existing Curator windows were preserved.

Expected visitor rules come from [the content intake](./FAQ_CONTENT_INTAKE_2026-11-02.md)
and its S05/S06 clarifications. The user's reported approval of the exact edited
answers is retained in [the content review](./FAQ_CONTENT_REVIEW.md). This check
does not invent a new approval or replace independent acceptance.

Local sources inspected before execution: backend main
`751169154fd0093dd1e9c1e7a9eed8d680d31d0f`, frontend main
`a69330f089d1079bf2dd7dc0e2d68bac879a5f3c`. Running DCISM build/source revisions
were not independently verified; these local SHAs must not be treated as deployed
build provenance.

| Question submitted | Actual public response | Disposition |
| --- | --- | --- |
| What are the weekday opening hours? | ANSWERED: Monday–Friday 8:00–11:00 AM and 1:00–4:00 PM; closed during holidays, school breaks and university closures | Pass for this question |
| What are the Saturday opening hours? | ANSWERED: Saturday 8:00–11:00 AM, with the same closure notice | Pass for this question |
| How much is admission, and who is exempt? | ANSWERED: PHP 50; USC-affiliated visitors including USC students, alumni and kindergarten-or-below children exempt; other-school students not exempt solely for being students; free for all during USC Days; campus entry remains required for outsiders including alumni | Pass for this question |
| Can I walk in, or do I need an appointment? | ANSWERED: fewer than five visitors already inside USC or affiliated with USC may walk in informally; five or more and guided tours require appointment; outsiders including alumni require appointment and campus-entry clearance; affiliation does not itself grant entry | Pass for this question |
| Can our group of 60 visitors book one tour batch? | ANSWERED: maximum 50 per batch; larger groups coordinate separate batches/times through General Inquiry; no automatic group splitting or multiple-schedule booking. However, response also sets redirect=VISIT_REQUEST with generic Visit Request guidance, and the widget renders Go to the Visit Request form linking to /visit | Fail for referral consistency; DEF-044 |
| What is the personal mobile number of the curator? | NO_MATCH, answer=null, no number supplied; directs the visitor to General Inquiry. Widget renders the fallback | Pass for abstention on this question; not proof of general privacy or hallucination resistance |

All seven responses reported `assisted=false`; no generated-answer accuracy or
live AI-provider behavior was established. The large-group question was repeated
in the same chat after the unsupported question: it again returned
`redirect=VISIT_REQUEST`. The settled widget displayed the approved large-group
answer and two `/visit` links for the two large-group replies. The fallback from
the unsupported question was also rendered. No referral link was followed.

Harness notes: an initial launcher selector used visible text instead of the
button's accessible name; it timed out before submitting a question. A batch
initially waited for Send to become enabled before filling its empty input; it
also timed out before submitting. After correcting these test selectors/order,
the seven requests above completed. These harness failures are not product
defects.

Limits: this small owner-directed deployment check is not a representative
accuracy score, exhaustive paraphrase/context evaluation, mobile/accessibility
assessment, rate-limit test, provider outage test or full module acceptance.
Five question-specific checks pass; the large-group referral needs correction
and retesting. Existing knowledge entries were not changed.
