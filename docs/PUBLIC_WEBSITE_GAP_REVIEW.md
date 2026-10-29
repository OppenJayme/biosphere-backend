# Public website and visitor workflow: SRS gap review

Reviewed 2026-10-28. This is source/requirements analysis, not browser execution,
an acceptance pass, approval of museum facts, or authorization to change another
owner's module or the shared database. No application code changed.

The original review is retained at its source baseline. A subsequent authorized
OBS-004 investigation is [recorded below](#subsequent-obs-004-investigation---2026-10-28)
and in DEF-027; its prepared frontend repair is not yet deployed.

## Baseline and method

- Backend integration baseline: `e6ae2a516ade4c33000344b18ca2016b8f8067b4`.
- Frontend integration baseline: `618d4380059d106ba820a36b20c4ce57c2069fbc`.
- Reviewed frontend source matches that baseline. Reviewed backend inquiry,
  visit-request, notification and communication-history directories match it;
  unrelated AR changes are outside this review.
- Primary requirements: [BioSphere-SRS.pdf](./BioSphere-SRS.pdf), sections 4.8,
  4.9 and 4.10 (PDF pages 72-78; printed pages 66-72), plus notification
  requirements in section 4.3 (PDF pages 57-58) and Appendix B.3 (PDF page 114).
  SHA-256: `15ee35ba1f163890ebfae270e47aee9ca9fde890e9b8727b23f079d8aa57fc65`.
- Compared actual PDF text with controllers, DTOs/services, public forms,
  curator actions/detail views, layouts, static content and existing guides.
  No application browser/API requests, live email, record writes, dependency
  changes or deployments were made. Existing tests were inspected, not run or
  added. Source presence is not
  proof of runtime behavior, authorization or provider delivery.

## Requirement coverage found in source

| SRS requirements | Source evidence | Review disposition |
| --- | --- | --- |
| 4.8-01 through 04: unauthenticated inquiry, minimum fields, validation, consent and identity | Frontend `InquiryForm.tsx`, inquiry `form.ts`; backend `CreateInquiryDto`, public POST and transaction in `InquiriesService.create` | Implemented in source; INQ acceptance remains separate |
| 4.8-05 through 09 and 11: search, statuses, referral, alerts, reply and history | Inquiry controller/service; curator inquiry actions/detail/referral dialog; communication history and submission notification services | Implemented paths found; live email delivery and full workflow acceptance not established here |
| 4.8-10: private inquiry data | Public POST returns a receipt; remaining inquiry routes require CURATOR; global auth/roles guards are configured | Access controls found; no live role/privacy pass claimed |
| 4.9-01 through 06: public visit, ordered schedule children, vehicles, counts, validation/consent | `RequestVisitForm`, visit `form.ts`, DTOs and `VisitRequestsService.create` child writes | Implemented in source; no live submission made |
| 4.9-07 through 11 and 14: review, statuses, visitor messages, alerts and history | Visit controller/service, `VisitRequestDetail`, workflow/actions, mail and communication history | Implemented paths found; provider/decision failure acceptance remains separate |
| 4.9-12, 13 and 4.9.16: selected schedule, preserved alternatives and manual USC boundary | Approve-schedule endpoint, preferred child records and copyable campus-entry summary | Implemented in source; no direct USC integration should be added |
| 4.9-15: internal access to visitor data | CURATOR-only read/action routes; public receipt projection | Implemented access boundary; no live authorization certification |
| 4.10-01 through 03 and 05: four areas, Plan Your Visit, forms, no Events MVP | Public Home/Gallery/Visit/About routes, header/footer and `VisitOptionsSection` | Structure implemented; navigation/mobile execution remains untested in this review |
| 4.10-04 and 06: approved Gallery/About information | Static collection data, placeholder imagery, About team, Visit/footer contacts | Existing WEB-003 content approval blocker remains |
| 4.10-07 and 10: static source-maintained pages | Content lives in frontend source; curator Public Website workspace handles submissions, not static page editing | Static implementation follows the SRS; a CMS is not a missing feature |
| 4.10-08 and 09: public privacy and responsive layouts | Public pages use static data/approved exhibit boundary; responsive classes and mobile navigation exist | Source intent only; WEB-004/005 need execution evidence, not a source-only Pass |

See the existing INQ/WEB acceptance rows in [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md).
Do not promote their statuses from this review or create duplicates of WEB-003.

## Prioritized gaps and dependencies

| Item | Classification and evidence | Owner / action |
| --- | --- | --- |
| Notification read/dismiss, REQ-4.3-07 | **Confirmed missing feature.** Backend `NotificationsController` exposes only GET; service derives alerts from Pending submissions. `NotificationBell` explicitly has no independent read/dismiss state; Prisma has no notification state model. Reviewing a submission changes the business record and is not a read/dismiss implementation. | John/Charles; coordinate authorization with Voltaire. Design persistent recipient state before adding endpoints/UI. Do not modify inquiry/visit/audit records to dismiss an alert. |
| Internal operational alerts, REQ-4.3-05/10 | **Partial feature.** Current feed covers new inquiries, visits and failed submission emails. Its types/service do not cover sync failures and the other listed internal operational events. The separate offline workspace is not evidence these events appear in the notification feed. | Dashboard/feed owners plus affected module owners. Define event sources and privacy-safe links incrementally. Internal alerts must not become new operational emails contrary to 4.3-10. |
| Approved public content, REQ-4.10-04/06 | **Known content dependency, WEB-003.** About contains a sample staff profile/placeholder phone; image module calls its assets stock placeholders. Visit/footer code contains different contact channels and hours/rules lack an approval source in the reviewed files. Different channels are not automatically wrong, but must be labelled/approved rather than guessed. | Public website owners John/Charles/Voltaire and Sir Curator. Obtain approved staff/contact/hours/history/rules and images, or explicit approval for clearly illustrative assets. Update static source; retain no sample role/contact as an approved museum fact. |
| Privacy notice and retention | **Approval/operational dependency.** `PrivacyConsent` has an explicit TODO for approved wording. Footer Privacy Policy/Terms are text spans, not an accessible notice destination. Consent timestamps exist; that does not establish approved notice or legal compliance. Retention/deletion policy is separately unresolved. | Museum/university approver with public-form owners. Obtain wording, notice destination and retention instructions. Do not invent policy, enable deletion/anonymization or claim compliance from a checked box. |
| Submission outcome/retry feedback | **Original source-review risk OBS-004; subsequently reproduced as [DEF-027](./TEST_DEFECT_LOG.md#def-027---public-forms-misreport-uncertain-submission-outcomes).** `submit.ts` turns malformed 2xx receipts into success with empty IDs/reference and a local timestamp; transport/5xx copy invites retry or says not sent. A response can be lost after a commit. No client retry identity is present in the reviewed create contract. | John/Charles, coordinate backend owner. Reproduce isolated request/UI cases before changing behavior; distinguish confirmed receipt, unavailable receipt and uncertain outcome, retaining fields and avoiding automatic replay. No public personal-data lookup should be added. |
| Modal pending/keyboard behavior | **Inspection candidate, not confirmed defect.** `visit/Modal.tsx` focuses its container and handles Escape/backdrop close, but no focus-containment/restoration mechanism is visible. Cancel/close paths are not tied to form submission state. | Public-form frontend owners. Bounded keyboard/pending-close reproduction can establish actual impact before a fix. Do not infer a WCAG or live data-loss result from this inspection. |
| Email/provider readiness | **Configuration and acceptance gap, not absent code.** Receipt/curator alerts/outbound replies and recorded delivery results exist. Guides say unset mail configuration skips sending; NODE_ENV=test prevents real mail. Provider acceptance is not proof of eventual inbox delivery. | Mail/deployment owner and curator. Check only with an agreed non-public fixture/recipient setup; no live email or secret access was authorized by this review. |

## Recommended next implementation

The strongest **new-feature** candidate is a bounded notification read/dismiss
foundation because REQ-4.3-07 is explicit and it does not require invented museum
content or a paid service. Coordinate with John/Charles rather than replacing
their ownership. Proposed first scope:

1. Per-curator persisted read/dismiss state for existing feed items. Treat this
   as a recommendation requiring confirmation; do not silently dismiss an alert
   for every curator. Define whether a later occurrence creates a new event
   identity so an old dismissal cannot hide a new failure.
2. Curator-only state changes with recipient ownership enforced on the server;
   preserve the underlying submission status, audit entries and related records.
3. Distinguish unread alert count from unresolved Pending inquiry/visit counts.
   A read alert can still represent unresolved work; those counters must not be
   conflated. Preserve privacy-safe links and failure/retry feedback.
4. Prepare/review any migration and verify only against an owned disposable
   target first. No shared migration or deployment is authorized here. Agree
   HTTP/UI/storage seams before adding tests. This first slice does not complete
   REQ-4.3-10's broader operational event integration.

OBS-004 is a separate, smaller reliability candidate. If reproduced as a
blocking integrity problem, contain/fix it before dependent visitor acceptance.
It should not be declared fixed or safe merely because normal submission works.

## Work that should not be added from this review

- No static-page CMS: it would contradict 4.10-07/10.
- No Events page, complete public inventory browser, public visitor-status lookup
  exposing personal information, direct ISMIS submission, or external email
  inbox import.
- No visitor-list upload, email webhook or destructive retention work solely
  because a guide lists it as unimplemented. These need their own approved
  requirement/scope; section 4.9's functional table does not require file upload.
- No fabricated staff details, schedule/rules, museum images or FAQ answers.
- No percentage completion or module sign-off from this source review.

The review also corrected stale guide references: the current PDF's inquiry
table ends at 4.8-11, schedule selection is **REQ-4.9.16**, and Appendix B.3 does
not add a Confirmed visit status. This is a documentation correction, not a
workflow change. Existing user-approved decisions still take precedence if a
later documented change explicitly supersedes the PDF.

## Subsequent OBS-004 investigation - 2026-10-28

The original source-only review above is historical. The user subsequently
authorized isolated helper/real-form regressions and repair. DEF-027 now records
red/green reproduction, 13 passing helper cases and fourteen real-form synthetic
HTTP scenarios, plus explicit remaining limits. The frontend distinguishes
confirmed/rejected/unknown outcomes, retains entries and requires an explicit
acknowledgement before another send. It does not add server idempotency or claim
that a response error proves the submission was never stored. See the
[repair checkpoint](./PUBLIC_SUBMISSIONS_GUIDE.md#uncertain-public-submission-feedback---2026-10-28).
Merge/deployment and independent owner acceptance remain pending; these tests
do not close unrelated public content/privacy/provider requirements.
