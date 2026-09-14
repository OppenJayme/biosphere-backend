# BioSphere FAQ Knowledge Management Guide

This module implements the curator-controlled knowledge lifecycle required by
REQ-4.11-02, REQ-4.11-03, and REQ-4.11-09 using the existing
`public.faq_entry` table. It does not change the database schema.

## Lifecycle and approval boundary

- New entries always start as `INACTIVE`. Status is not accepted by create or
  update DTOs, and requests that try to inject one are rejected.
- Curators may edit `ACTIVE` and `INACTIVE` knowledge.
- Activation is the explicit approval step that makes an entry eligible for
  the future public matching service.
- Deactivation removes an entry from matching eligibility without destroying
  it.
- Archive is permanent through routine API operations. Archived entries remain
  readable for history but cannot be edited, activated, or deactivated.
- Repeating the current lifecycle command is idempotent and does not create a
  duplicate audit event.
- No hard-delete endpoint is exposed.

## Knowledge fields

- `question` and `answer` are required non-empty plain text.
- `alternativeWording` and `keywords` are optional curator-approved text lists.
  Values are trimmed, repeated whitespace is collapsed, and case-insensitive
  duplicates within a request are removed while preserving the first spelling.
- `category` is optional curator-extensible text limited to the existing
  PostgreSQL `VARCHAR(100)` boundary. It is not an enum.
- HTML is not interpreted by the backend. Frontends must render these fields as
  escaped text unless a separate reviewed rich-text policy is introduced.

## Endpoints

- `POST /faq/entries`
- `GET /faq/entries?status=INACTIVE&category=Visit&page=1&limit=25`
- `GET /faq/entries/:id`
- `PATCH /faq/entries/:id`
- `PATCH /faq/entries/:id/activate`
- `PATCH /faq/entries/:id/deactivate`
- `PATCH /faq/entries/:id/archive`

All endpoints in this slice require an authenticated, active `CURATOR` account.
Mutations store BioSphere `user_account.id` attribution and write a protected
audit event atomically in the same serializable Prisma transaction.

## Deliberately deferred public matching

REQ-4.11-04 through REQ-4.11-07 and BR-18 require the public assistant to answer
only from active approved knowledge and fall back to General Inquiry when no
configured rule matches. The SRS does not freeze those matching rules, and the
database has no matching-configuration table. This slice therefore does not
invent fuzzy, semantic, or AI-based matching behavior.

Before implementing the public query endpoint, the team/client must approve the
matching method, thresholds, ambiguity behavior, and fallback wording. The
future endpoint must be public but rate-limited, must query `ACTIVE` entries
only, must collect no personal information, and must never generate an answer
outside stored curator-approved text.
