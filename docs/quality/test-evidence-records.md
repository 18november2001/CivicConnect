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
| End-to-end | `tests/e2e/` | 5 | System, over HTTP through the running service | Yes |
| **Total** | | **46** | | |

Coverage against the M3 minimum:

| M3 requirement | Minimum | Provided |
|---|---|---|
| Unit / component | 5 | 22 |
| Black-box functional | 5 | 10 |
| API / integration | 3 | 9 |
| E2E / system | 2 | 5 |
| Negative / failure / unauthorised | 3 | 11 |
| High-priority requirement or risk coverage | 5 | 14 |
| Black-box design techniques | 2 | 3 |
| Performance / load | 1 | 1, the staff queue filter exercise, TER-15 |

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

## TER-11 — Complete citizen journey across the integrated system

| Field | Entry |
|---|---|
| Test ID | E2E-01 |
| Test basis | FR-006 controlled lifecycle, and the M3 requirement for a critical end-to-end journey. A citizen reports a fault and a municipal team resolves it. |
| Why selected | Every other suite reaches the domain or persistence layer directly. This is the only case that proves the layers are wired to one another. It was selected for exactly that reason, and it justified itself immediately: writing it exposed DEF-008 and DEF-009, neither of which any layer-level test could have found. |
| Technique / level | End-to-end system test, black-box, over HTTP |
| Input / precondition | A seeded citizen, staff member and supervisor. `POST /api/v1/requests` with a valid report, then three `PATCH /api/v1/requests/:id/status` calls: to Assigned as Supervisor with an assignee, to In_Progress as Staff, to Resolved as Staff with a 48 character resolution note. Then `GET /api/v1/requests/:id`. |
| Expected result | 201 then 200, 200, 200. The created request carries a tracking code matching `REQ-YYYYMMDD-XXXX`. The final read reports Resolved with at least two public timeline entries. The audit log holds exactly three STATUS_CHANGE rows, in order: Submitted to Assigned, Assigned to In_Progress, In_Progress to Resolved. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/e2e/requestLifecycleJourney.e2e.test.js`, CI run, job `Black-box and integration tests`, step `End-to-end system tests` |
| Traceability | FR-006, ASR-03, ADR-DES-001, ADR-DES-002, NFR-002 |
| Interpretation | Demonstrates that the HTTP layer, the lifecycle engine, the event dispatcher and the database work together, and that each transition is individually audited rather than only the final state being recorded. It does not demonstrate that a user interface can drive this journey; the front end has never been connected to the API, which is recorded as R-INT-01 in the Release Evidence Summary. |

## TER-12 — Role authority enforced at the API boundary

| Field | Entry |
|---|---|
| Test ID | E2E-02 |
| Test basis | FR-006 role authority, and risk R-DES-01 that the state machine can be bypassed. |
| Why selected | A rule proven only in the domain layer is a rule proven in the one place an attacker does not stand. The question this answers is whether the authority check survives the trip through routing and the controller. |
| Technique / level | End-to-end system test, negative, over HTTP |
| Input / precondition | A citizen attempts `PATCH /api/v1/requests/:id/status` to Assigned, supplying a valid staff assignee so that the only possible ground for refusal is the actor's role. |
| Expected result | HTTP 422 with a non-empty `violations` array. The request remains Submitted on a subsequent read, and no STATUS_CHANGE audit row exists for it. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/e2e/requestLifecycleJourney.e2e.test.js`, CI run |
| Traceability | FR-006, R-DES-01, ADR-DES-002, NFR-002 |
| Interpretation | Demonstrates that refusal is enforced at the boundary and that a refused transition is clean: it leaves no partial write and no audit record for an event that never happened. It does not demonstrate that the actor is who they claim to be. The API accepts `actorId` from the request body and the authentication middleware is not applied to any route, which is recorded as R-SEC-01 and is the first stated condition on the release. |

## TER-13 — Lifecycle stage cannot be skipped through the API

| Field | Entry |
|---|---|
| Test ID | E2E-03 |
| Test basis | FR-006. The transition model permits Submitted to Assigned, not Submitted to Resolved. |
| Why selected | This is the sneak path R-ARCH-02 warns about: a caller bypassing the intended sequence through a new entry point. The resolution note is deliberately valid, so a refusal can only come from the transition model and not from a guard. |
| Technique / level | End-to-end system test, state transition, negative |
| Input / precondition | `PATCH` to Resolved as Staff directly from Submitted, with a resolution note above the 20 character threshold. |
| Expected result | HTTP 422; the request remains Submitted. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/e2e/requestLifecycleJourney.e2e.test.js`, CI run |
| Traceability | FR-006, R-ARCH-02, ADR-DES-001 |
| Interpretation | Confirms the transition table, not merely the guards, governs the API. Distinguishing the two matters: a guard failure and a model failure produce the same HTTP status but have different causes and different fixes. |

## TER-14 — Input validation and unknown resources at the boundary

| Field | Entry |
|---|---|
| Test ID | E2E-04, E2E-05 |
| Test basis | Defensive behaviour of the HTTP interface. |
| Why selected | A service that returns 500 for a missing field or an unknown identifier leaks implementation detail and gives a caller no way to correct the request. |
| Technique / level | End-to-end system test, negative |
| Input / precondition | A submission missing every field except the requester and title; a `GET` for a well-formed but non-existent UUID; a `GET` for an unmatched route; a `GET /health`. |
| Expected result | 400, 404, 404, and 200 with a status of UP and a timestamp. |
| Actual result | As expected. |
| Status | Pass |
| Evidence | `tests/e2e/requestLifecycleJourney.e2e.test.js`, CI run |
| Traceability | FR-006, NFR-004 |
| Interpretation | Demonstrates that the boundary distinguishes a malformed request from a missing resource. It does not constitute a security assessment; no input fuzzing or injection testing was performed. |

## TER-15 — Staff queue filter under load

| Field | Entry |
|---|---|
| Test ID | PERF-01 |
| Test basis | NFR-003 responsiveness of the staff queue, and the composite indexes in `db/schema/002_indexes_and_security.sql`. |
| Why selected | It is the only read a staff member performs repeatedly during a shift, it filters and sorts over the table that grows without bound, and the indexes exist specifically to support it. Those indexes did not exist in the repository until Milestone 3, which is DEF-003, so this exercise also answers whether adding them achieved anything. |
| Technique / level | Performance exercise, measured at the HTTP boundary |
| Input / precondition | 2,000 seeded service requests in one suburb, distributed across all five lifecycle states. `GET /api/v1/requests?status=Submitted&suburb=...&limit=50`, 100 sequential calls after 10 warm-up calls. Node 22, PostgreSQL 16, database local to the process. |
| Expected result | p95 under the 300 ms working target, and no non-200 responses. |
| Actual result | mean 4.2 ms, p50 3.8 ms, p95 6.2 ms, max 13.6 ms, 0 non-200 responses. Target met. |
| Status | Pass |
| Evidence | `tests/performance/staffQueueLoad.js`, run with `npm run perf`; figures reproduced in the Release Evidence Summary section 4 |
| Traceability | NFR-003, DEF-003, ADR-ARCH-001 |
| Interpretation | The target is met with a wide margin, but the figure is weaker evidence than it looks. The calls are sequential, so this is single-user latency and says nothing about contention; the database is local, so no network latency is included; and the synthetic data is uniformly distributed, which is kinder to an index than real municipal data. The more useful finding is the query plan: the planner chose `idx_service_requests_sla_monitoring` rather than an index written for this filter, and still sorted the result in memory. At 2,000 rows that costs nothing, so it is recorded as technical debt rather than a defect. |

---

## What the suite does not demonstrate

Stated here rather than left for an assessor to find.

- **No journey driven through the user interface.** The end-to-end cases drive the system through its HTTP interface, not through the front end. The front end has never been connected to the API and runs on mock data, recorded as R-INT-01.
- **Performance is measured on one operation only, sequentially.** TER-15 covers the staff queue filter under a single-user workload. No other operation has been measured and no concurrent load has been applied.
- **Concurrency is simulated sequentially.** TER-07 constructs the stale-version condition deliberately; it does not run genuine parallel load.
- **The messaging provider is simulated.** No test exercises a real WhatsApp or SMS provider, as recorded in ADR-INT-001.
- **Caller identity is unverified.** The API takes `actorId` from the request body and applies no authentication middleware, so every authority rule proven above is enforced against a claim nobody checked. Recorded as R-SEC-01.
- **Partial subscriber failure is untested.** The suite covers a refused transition and a successful one, not a subscriber that fails midway through the transactional phase.
- **Coverage percentage is not reported.** The suite is selected by risk rather than by line coverage, and a percentage would suggest a completeness the selection does not claim.
