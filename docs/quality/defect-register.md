# CivicConnect Defect Register

Defects found during Milestone 3 verification. Each record follows
defect, severity and impact, status, fix, and regression evidence where
corrected.

Defects are recorded whether they were found by a test, by static analysis, or
by attempting to run something that had never been run. A defect found by
reading rather than by tooling is still a defect.

| ID | Defect | Found by | Severity / impact | Status | Fix | Regression evidence |
|---|---|---|---|---|---|---|
| DEF-001 | `migrations/Core_Schema.sql` line 1 reads `CREATE EXTENSION IF NOT EXIST` instead of `IF NOT EXISTS`. The script aborts on its first statement, so no table is ever created. | Attempting to apply the schema to a PostgreSQL instance for the first time during M3 integration testing | Critical. The entire database schema had never been successfully applied. Every persistence claim in the PED was unverified, and no integration or end-to-end test was possible. | Fixed | Corrected to `IF NOT EXISTS` in `db/schema/001_core_schema.sql` | Schema applies cleanly in the CI workflow before every test run; nine integration tests depend on it |
| DEF-002 | `migrations/Core_Schema.sql` drops `service_request` (singular) while the table it creates is `service_requests` (plural). The drop silently matches nothing, so re-applying the schema fails on an existing database. | Code review during the DEF-001 fix | Medium. Not visible on a clean database. Would surface as a confusing failure the first time the schema was re-applied. | Fixed | Corrected to `service_requests` and extended to drop `messaging_outbox` | Schema re-applies idempotently in CI |
| DEF-003 | `migrations/Indexes_and_Security.sql` is an empty file. The PED describes four composite indexes supporting NFR-003 and REVOKE statements making the audit log immutable for NFR-002. Neither existed. | File inspection during M3 verification planning | High. Two written quality claims had no implementation. The NFR-002 immutability claim in particular was stated in the PED and in ADR-DES-002 and was not true of the repository. | Fixed | Implemented in `db/schema/002_indexes_and_security.sql`, including a dedicated `civicconnect_app` role, because a REVOKE has no effect against the table owner | TER-08 and TER-09 verify the revocation is enforced and proportionate |
| DEF-004 | Two tables exist for the same purpose: `outbound_messages` in the core schema, and `messaging_outbox` created by ADR-INT-001. Only the latter is written by any code. `outbound_messages` defaults `dispatch_status` to `SIMULATED_SENT`, recording a message as delivered at the moment of insert, with no idempotency key, attempt count or failure state. | Schema review during M3 integration testing | Medium. No functional failure today because nothing writes to `outbound_messages`, but it is a dead table that contradicts the documented outbox design and will mislead a future developer. | Open | Proposed: drop `outbound_messages` and record the removal as a controlled change, retaining `messaging_outbox` as the single implementation of ADR-INT-001 | Pending team decision |
| DEF-005 | `simulatedMessagingAdapter.js` returned the value of `setTimeout` from inside a promise executor, which the `no-promise-executor-return` rule flags as a latent defect: a value returned from an executor is discarded, and the pattern conceals a returned promise if the body ever changes. | ESLint, on the first run of the newly configured static analysis gate | Low. No current misbehaviour; the latency delay worked as intended. | Fixed | Executor body wrapped in braces so nothing is returned | Lint gate passes; messaging unit tests unchanged and still passing |
| DEF-006 | `package.json` declared `jest` and `supertest` as dev dependencies while the test suite uses the Node built-in runner, and the `test` script was still the npm default error stub. `npm test` failed on a clean checkout. | Attempting to run the suite through npm during CI configuration | Medium. A new developer or an assessor following convention would conclude the project had no tests. | Fixed | Unused dependencies removed; `test`, `test:unit`, `test:blackbox`, `test:integration`, `test:all` and `lint` scripts defined | CI invokes the npm scripts rather than raw commands, so the scripts are exercised on every run |

## Interpretation

Four of the six defects were found by trying to run something for the first
time rather than by a test failing. DEF-001 and DEF-003 in particular were
present in the repository throughout Milestone 2 and were not detected, because
no automated check and no deployment ever exercised the schema.

That is the strongest argument available for the CI gate introduced in this
milestone. The project did not lack care; it lacked a step that would have
failed. The pipeline now applies the schema and runs the full suite on every
pull request, so a defect of this class cannot survive a merge again.
