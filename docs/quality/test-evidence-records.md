# CivicConnect Test Evidence Records

Milestone 3 verification evidence. Each record uses the field structure required
by the M3 brief. Records are given for the cases that carry real engineering
weight; routine cases within the same suite are covered by the suite summary
rather than duplicated here.

Execution evidence for every record is the CI run on the identified release
candidate commit.

## Suite summary

| Suite | Location | Cases | Technique / level | Requires database |
|---|---|---|---|---|
| Unit | `tests/unit/` | 22 | Unit / component | No |
| Black-box | `tests/blackbox/` | 10 | State transition, boundary value, decision table | No |
| Integration | `tests/integration/` | 9 | Integration, persistence, privilege | Yes |
| **Total** | | **41** | | |

Coverage against the M3 minimum:

| M3 requirement | Minimum | Provided |
|---|---|---|
| Unit / component | 5 | 22 |
| Black-box functional | 5 | 10 |
| API / integration | 3 | 9 |
| E2E / system | 2 | Outstanding, depends on the HTTP API |
| Negative / failure / unauthorised | 3 | 8 |
| High-priority requirement or risk coverage | 5 | 11 |
| Black-box design techniques | 2 | 3 |
| Performance / load | 1 | Outstanding |

---

## TER-01 — Valid lifecycle path

| Field | Entry |
|---|---|
| Test ID | BB-01 |
| Test basis | FR-006 controlled lifecycle. A request must be able to complete the normal journey from submission to closure. |
| Why selected | If the permitted path were blocked the system would be unusable, and a suite that only proves refusals would not detect it. |
| Technique / level | State transition testing, black-box |
| Input / precondition | Four transitions in sequence: Submitted to Assigned as Staff with an active assignee, Assigned to In Progress, In Progress to Resolved with a 45 character note, Resolved to Closed as Supervisor. |
| Expected result | Every transition permitted, no violations returned. |
| Actual result | All four permitted. |
| Status | Pass |
| Evidence | `tests/blackbox/lifecycleBlackBox.test.js`, CI run |
| Traceability | FR-006, ASR-03, ADR-DES-001 |
| Interpretation | Demonstrates the happy path is reachable. It does not demonstrate persistence, which is covered by TER-05. |

## TER-02 — Invalid transition refusal

| Field | Entry |
|---|---|
| Test ID | BB-02 |
| Test basis | FR-006. Only the transitions in the specified model are legal. |
| Why selected | These are sneak paths: moves no user interface would offer, but which an API caller or a future screen could still attempt. The risk R-ARCH-02 describes is precisely that a new entry point bypasses the rules. |
| Technique / level | State transition testing, black-box |
| Input / precondition | Seven invalid pairs, each attempted as Supervisor with every guard precondition satisfied, so that refusal can only come from the transition model itself. |
| Expected result | All seven refused. |
| Actual result | All seven refused. |
| Status | Pass |
| Evidence | `tests/blackbox/lifecycleBlackBox.test.js` |
| Traceability | FR-006, R-ARCH-02, ADR-DES-001 |
| Interpretation | The transition model is enforced independently of role and preconditions. It does not prove a caller cannot write the status column directly, which remains R-DES-01. |

## TER-03 — Resolution note boundary

| Field | Entry |
|---|---|
| Test ID | BB-04 |
| Test basis | FR-006 acceptance criterion for resolution, and the CHECK constraint on `service_requests.resolution_notes` requiring at least 20 characters. |
| Why selected | The threshold is the point at which application validation and database validation must agree. A mismatch would allow the application to accept input the database then refuses, surfacing to the user as an unexplained error. |
| Technique / level | Boundary value analysis, black-box |
| Input / precondition | Notes of 0, 19, 20 and 21 characters attempted on In Progress to Resolved as Staff. |
| Expected result | 0 and 19 refused, 20 and 21 permitted. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/blackbox/lifecycleBlackBox.test.js` |
| Traceability | FR-006, ADR-DES-001 |
| Interpretation | Confirms the application boundary. TER-06 confirms the database enforces the same value, so the two layers are verified to agree. |

## TER-04 — Closure authority decision table

| Field | Entry |
|---|---|
| Test ID | BB-06 |
| Test basis | FR-006 and NFR-001. Closure is a supervisory act and may not be performed by the staff member who resolved the request. |
| Why selected | Two conditions combine, role and current state, and a defect in either produces an authorisation failure rather than a visible error. Combination coverage is the point. |
| Technique / level | Decision table testing, black-box |
| Input / precondition | Five rule combinations across Citizen, Staff, Supervisor and Admin, from both Resolved and In Progress. |
| Expected result | Supervisor and Admin from Resolved permitted; all others refused. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/blackbox/lifecycleBlackBox.test.js` |
| Traceability | FR-006, NFR-001, ADR-DES-001 |
| Interpretation | Demonstrates separation of duty at the lifecycle level. It does not verify authentication, which is a separate control. |

## TER-05 — Transition atomicity

| Field | Entry |
|---|---|
| Test ID | INT-01 |
| Test basis | FR-006 with NFR-002. A status change and its audit record must commit together. |
| Why selected | PED section 34.4 recorded this as the principal unproven claim at the M2 baseline. It is the highest-value gap in the project's verification evidence. |
| Technique / level | Integration, against a real PostgreSQL instance |
| Input / precondition | Seeded citizen, staff member and a Submitted request. Transition to Assigned as Staff with an active assignee. |
| Expected result | Status becomes Assigned; exactly one audit row, one timeline row and one outbox row exist; the audit row records the correct previous and new state and actor. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/lifecycleIntegration.test.js`, CI run |
| Traceability | FR-003, FR-005, FR-006, NFR-002, ADR-DES-002 |
| Interpretation | Closes the atomicity gap recorded at M2. It verifies the commit path; TER-07 verifies the rollback path, and both are needed before the claim holds. |

## TER-06 — Rollback completeness

| Field | Entry |
|---|---|
| Test ID | INT-02 |
| Test basis | NFR-002. An audit record for a transition that did not occur is a data integrity defect. |
| Why selected | This is the failure mode the two-phase dispatcher in ADR-DES-002 exists to prevent. Without this test the design decision has no verification behind it. |
| Technique / level | Integration, negative |
| Input / precondition | Attempt Submitted to Resolved, which the model forbids, with a valid resolution note so that refusal comes from the transition model. |
| Expected result | `IllegalTransitionError` raised; status unchanged; zero audit, timeline and outbox rows. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/lifecycleIntegration.test.js` |
| Traceability | NFR-002, ADR-DES-002 |
| Interpretation | Demonstrates that transactional subscribers roll back with the transition. It does not cover a subscriber that fails partway, which remains untested. |

## TER-07 — Optimistic concurrency

| Field | Entry |
|---|---|
| Test ID | INT-03 |
| Test basis | FR-005. Two dispatchers must not silently overwrite one another. |
| Why selected | Lost updates are invisible in normal use and only appear as a disputed record later, so they must be caught by test rather than by observation. |
| Technique / level | Integration, negative |
| Input / precondition | Two transitions submitted against the same `updated_at` version. The first succeeds, the second is stale. |
| Expected result | Second attempt rejected with `CONCURRENT_MODIFICATION`; first writer's status retained; only one audit row. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/lifecycleIntegration.test.js` |
| Traceability | FR-005, NFR-002 |
| Interpretation | Verifies the version check rejects a stale write. It is a sequential simulation of a race rather than genuine concurrent load, which is a stated limitation. |

## TER-08 — Audit immutability under the application role

| Field | Entry |
|---|---|
| Test ID | SEC-01, SEC-02, SEC-03 |
| Test basis | NFR-002. The PED states that UPDATE, DELETE and TRUNCATE are revoked on the audit and timeline tables at database level. |
| Why selected | This is a privilege claim, and a privilege claim is only verified by attempting the forbidden operation as the restricted role. Running it as the table owner would pass meaninglessly. |
| Technique / level | Integration, negative, privilege |
| Input / precondition | Connect as `civicconnect_app`. Attempt UPDATE and DELETE on `request_audit_log`, and UPDATE on `request_timeline_updates`. |
| Expected result | All three refused with permission denied; the audit row survives. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/auditImmutability.test.js` |
| Traceability | NFR-002, ADR-DES-002 |
| Interpretation | The immutability claim now has evidence behind it. Prior to M3 the control was described in the PED but the implementing file was empty, so the claim was unsupported. The control does not protect against an actor with owner or superuser rights, which is a stated residual risk. |

## TER-09 — Control proportionality

| Field | Entry |
|---|---|
| Test ID | SEC-04 |
| Test basis | NFR-002 with NFR-004. A control that blocks everything is indistinguishable from a broken connection. |
| Why selected | Negative tests alone cannot distinguish a working restriction from a failed one. This confirms the restriction is targeted. |
| Technique / level | Integration, positive control |
| Input / precondition | As `civicconnect_app`, append an audit row, read it back, and update a service request. |
| Expected result | All three permitted. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/auditImmutability.test.js` |
| Traceability | NFR-002 |
| Interpretation | Confirms TER-08's refusals are the specific restriction and not a connection or permission failure affecting everything. |

## TER-10 — Outbox idempotency

| Field | Entry |
|---|---|
| Test ID | INT-05 |
| Test basis | ADR-INT-001. Dispatch is at-least-once, so a retry after an ambiguous provider response must not produce a second message. |
| Why selected | Duplicate messages to a citizen are a visible service failure, and the only thing preventing them is the unique constraint on the idempotency key. |
| Technique / level | Integration |
| Input / precondition | Two inserts with the same idempotency key and different message bodies. |
| Expected result | One row only; the original body preserved. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/integration/lifecycleIntegration.test.js` |
| Traceability | ADR-INT-001, R-INT-01 |
| Interpretation | Verifies the database-level guarantee. It does not verify that a real provider honours the key, which remains part of R-INT-01. |

---

## What the suite does not demonstrate

Stated here rather than left for an assessor to find.

- **No end-to-end journey.** There is no HTTP API, so no test exercises a complete user journey across the integrated system.
- **No performance evidence.** No workload has been run against any operation.
- **Concurrency is simulated sequentially.** TER-07 constructs the stale-version condition deliberately; it does not run genuine parallel load.
- **The messaging provider is simulated.** No test exercises a real WhatsApp or SMS provider, as recorded in ADR-INT-001.
- **Partial subscriber failure is untested.** The suite covers a refused transition and a successful one, not a subscriber that fails midway through the transactional phase.
- **Coverage percentage is not reported.** The suite is selected by risk rather than by line coverage, and a percentage would suggest a completeness the selection does not claim.
