# BioSphere Test Defect Log

**Test plan:** [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md)  
**Rule:** Never place secrets, access tokens, passwords, or personal data in a
defect entry.

## 1. Severity and priority

Severity describes impact; priority describes repair order.

| Severity    | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| S1 Critical | Security compromise, irreversible data loss, or core system unavailable         |
| S2 Major    | Data-integrity or authorization failure, or a critical workflow cannot complete |
| S3 Moderate | Incorrect behavior with a safe workaround                                       |
| S4 Minor    | Cosmetic, wording, or low-impact usability issue                                |

| Priority | Meaning                                          |
| -------- | ------------------------------------------------ |
| P0       | Stop other work and repair immediately           |
| P1       | Repair before module acceptance                  |
| P2       | Schedule in the current testing/refinement phase |
| P3       | Backlog improvement                              |

Valid statuses: `Open`, `In progress`, `Ready for retest`, `Verified`,
`Deferred`, `Rejected`, and `Duplicate`.

## 2. Summary

| ID      | Date       | Module                   | Summary                                            | Severity | Priority | Status | Owner                |
| ------- | ---------- | ------------------------ | -------------------------------------------------- | -------- | -------- | ------ | -------------------- |
| DEF-001 | 2026-09-29 | Cataloging / Collections | Duplicate normalized collection names are accepted | S2 Major | P1       | Open   | Cataloging / Backend |

## 3. Defect details

### DEF-001 - Duplicate normalized collection names are accepted

**Related test:** CAT-001  
**Environment:** Development  
**Found on:** current `develop` during frontend acceptance testing

#### Preconditions

- Tester is signed in as an active curator.
- Collection Management is available.

#### Reproduction

1. Open Collection Management.
2. Add a collection named `Entomology`.
3. Add `Entomology` again.
4. Also verify variants such as `entomology` and `ENTOMOLOGY`.

#### Expected

Only one normalized `Entomology` collection may exist. Create and rename
operations that collide with it return a clear conflict message and make no
database or audit mutation.

#### Actual

Two records with different UUIDs and the same visible name are created and
displayed. This can fragment specimen assignments across apparently identical
collections.

#### Technical observation

- `CollectionsService.create` and `CollectionsService.update` do not check for
  an existing case-insensitive normalized name.
- `public.collection.collection_name` has no database uniqueness protection.
- The frontend correctly displays the two distinct records; it is not merely a
  rendering duplicate.

#### Required remediation

1. Define normalization as trimming surrounding whitespace and comparing names
   case-insensitively.
2. Return HTTP `409 Conflict` from create and rename collisions.
3. Add a concurrency-safe PostgreSQL uniqueness rule through a reviewed Prisma
   migration or approved custom migration SQL.
4. Map the conflict to a specific frontend message.
5. Add service and E2E tests for exact, case, whitespace, rename, and concurrent
   collisions.
6. Inspect existing duplicate UUIDs and specimen reference counts.
7. Choose one canonical record, transactionally reassign references, and only
   then remove the duplicate.

Do not delete either existing row manually until references have been checked.

#### Retest

- [ ] Exact duplicate create returns `409`.
- [ ] Case-only and surrounding-whitespace duplicates return `409`.
- [ ] Rename to another collection's normalized name returns `409`.
- [ ] Repeating the same-name rename is handled clearly.
- [ ] Concurrent duplicate requests cannot create two records.
- [ ] Existing specimen-to-collection relationships remain correct after
      cleanup.
- [ ] Audit history contains only successful accepted mutations.

## 4. New defect template

Copy this section for each new failure:

```markdown
### DEF-XXX - Short, observable problem

**Related test:** TEST-ID
**Environment:** Development
**Found on:** frontend commit / backend commit
**Severity:** S1-S4
**Priority:** P0-P3
**Status:** Open
**Owner:** Module / person

#### Preconditions

#### Reproduction

1.
2.
3.

#### Expected

#### Actual

#### Evidence

#### Suspected scope

#### Retest

- [ ] Original reproduction no longer fails.
- [ ] Negative and regression cases pass.
```

When a defect is fixed, update its status to `Ready for retest`. A tester then
records the tested commit and changes it to `Verified`; do not erase the entry.
