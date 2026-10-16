# CivicConnect Release Evidence Summary

**Release candidate:** `v3.0-rc1`
**Date:** 16 October 2026
**Classification:** CONDITIONALLY READY

---

## 1. What this release contains

A request lifecycle service with an HTTP API, a PostgreSQL persistence layer, an
explicit state machine governing the request lifecycle, a two-phase domain event
dispatcher, and a simulated messaging boundary behind a port and adapter.

| Capability | State |
|---|---|
| Citizen submits a service request over HTTP | working, verified end to end |
| Staff and supervisors move a request through its lifecycle | working, verified end to end |
| Illegal and unauthorised transitions are refused | working, verified end to end |
| Audit trail written atomically with each transition | working, verified against a real database |
| Audit records cannot be altered by the application role | working, verified by attempting the forbidden operation |
| Citizen-facing timeline | working |
| Outbound messaging | **simulated only**, no real provider |
| Authentication endpoints (login, register, JWT issue and verify) | implemented |
| Authentication enforced on request routes | **not wired**, see section 5 |
| Web front end (React) | implemented, runs on mock data |
| Front end talking to the API | **not integrated**, see section 5 |

## 2. Verification evidence

| Suite | Cases | Result | What it covers |
|---|---|---|---|
| Unit and component | 22 | Pass | Lifecycle rules and messaging boundary in isolation |
| Black-box functional | 10 | Pass | Specified behaviour treated as a closed box |
| Integration and persistence | 9 | Pass | Atomicity, concurrency, constraints, privileges against real PostgreSQL |
| End-to-end over HTTP | 5 | Pass | Complete citizen-to-resolution journey through the running service |
| **Total** | **46** | **Pass** | |

Against the Milestone 3 minimum baseline:

| Required | Minimum | Actual |
|---|---|---|
| Unit / component | 5 | 22 |
| Black-box functional | 5 | 10 |
| API / integration | 3 | 9 |
| E2E / system | 2 | 5 |
| Negative / unauthorised | 3 | 11 |
| Black-box techniques | 2 | 3 |
| Performance exercise | 1 | 1 |
| Static analysis | 1 | ESLint, 20 rules |
| Secret scanning | 1 | gitleaks |

## 3. Quality gates

Four checks are configured as required status checks on `main` and must pass
before any merge, alongside two independent approvals:

`unit-tests`, `Static analysis`, `Secret scan`, `Black-box and integration tests`.

The gate has been demonstrated blocking, not merely running. CI run 28 failed on
the integration job and prevented the merge; the cause was recorded as DEF-007,
fixed, and verified green by the same gate in run 34.

## 4. Performance

One exercise, on the staff queue filter, which is the only repeated read over an
unbounded table and the operation the composite indexes were written to support.

| Measure | Value |
|---|---|
| Workload | 2,000 seeded requests, 100 sequential calls after 10 warm-up calls |
| Target | p95 under 300 ms |
| p50 | 3.8 ms |
| p95 | 6.2 ms |
| max | 13.6 ms |
| Result | **target met** |

**Interpretation, including what this does not show.** The target is met with
large margin, but the figure is weaker evidence than it appears. The calls are
sequential, so this is single-user latency and says nothing about contention.
The database is local to the process, so no network latency is included. The
synthetic data is uniformly distributed, which is kinder to an index than real
municipal data.

The query plan is the more useful finding. The planner chose
`idx_service_requests_sla_monitoring` rather than an index written for this
filter, and still sorted the result in memory. The queue filter is therefore
riding an index intended for a different query. At 2,000 rows that costs
nothing. It is recorded as technical debt rather than a defect, because the
behaviour is correct and only the efficiency is incidental.

## 5. Blockers, limitations and residual risks

**Resolved during this milestone, and material.**

| ID | What it was | Why it mattered |
|---|---|---|
| DEF-001 | `CREATE EXTENSION IF NOT EXIST` aborted the schema on line 1 | No table had ever been created. Every persistence claim at M2 was unverified. |
| DEF-003 | The indexes and security file was empty | The NFR-002 audit immutability claim was stated in the PED and in ADR-DES-002 and was untrue of the repository. |
| DEF-007 | Integration test files ran in parallel against one database | Verification evidence was not reproducible across machines. |
| DEF-008 | Four modules required `../config/database`; the file is `Database.js` | The API, the auth controller and both background workers could not load on Linux at all. Worked on Windows by accident of a case-insensitive filesystem. |
| DEF-009 | The controller called the lifecycle engine with the wrong parameter shape, so both states arrived as `undefined` | Every status transition through the API was refused with HTTP 422. Found during end-to-end testing and corrected on the backend branch before merge. |

**Open, and accepted for this release.**

| ID | Risk | Mitigation and residual exposure |
|---|---|---|
| DEF-004 | `outbound_messages` and `messaging_outbox` both exist for the same purpose; only the latter is written by the domain layer, while the API writes to the former | No functional failure today. Two tables recording the same intent will diverge, and a future developer will trust the wrong one. Removal pending a controlled change. |
| R-SEC-01 | An authentication layer exists (`middleware/auth.js`, `routes/authRoutes.js`) but no route applies it. `actorId` is still taken from the request body | A caller can obtain a valid token and then ignore it, because every mutating endpoint accepts an unauthenticated request that declares its own actor and role. The lifecycle rules are enforced correctly against the claimed role; the claim itself is unverified. This is the single largest reason the release is not classified READY. The fix is one middleware call per route, deliberately not attempted at this point in the milestone because wiring an untested auth path late is worse than a stated gap. |
| R-INT-01 | The front end and the API have never been connected. The front end defaults to in-memory mock data, and its live client expects endpoints and payload shapes the API does not implement | The front end is tested and the API is tested, but no evidence exists that they work together. Differences include authentication paths, an assign endpoint, reporting and lookup endpoints, the transition payload field names, response envelope shape and error body shape. The release candidate is therefore integrated at the database and domain layers and not at the presentation layer. |
| R-AUD-01 | Audit immutability is enforced by REVOKE against the application role | It does not protect against an actor holding database owner or superuser rights. Accepted and stated. |
| R-MSG-01 | The messaging provider is simulated | No real WhatsApp or SMS delivery has ever been exercised, as recorded in ADR-INT-001. |
| R-PERF-01 | One performance exercise, sequential, synthetic data | Concurrent behaviour is unmeasured. |
| R-TEST-01 | Partial subscriber failure is untested | The suite covers a refused transition and a successful one, not a subscriber failing midway through the transactional phase. |

## 6. Classification and justification

**CONDITIONALLY READY.**

The release is not classified READY because of R-SEC-01. The API accepts the
caller's assertion of who they are. The lifecycle authority rules are correct
and enforced, and the tests prove they are enforced, but they are enforced
against an identity nobody has verified. A system that decides what a
supervisor may do, and then lets the caller declare themselves a supervisor,
has an access control model in name only. That is not a defect to note in
passing; it is the condition on this release.

It is not classified NOT READY either. The core journey works end to end, the
schema is sound and verified, every transition is audited atomically, the audit
record cannot be altered by the application, and the defects found during this
milestone, two of them critical, were fixed rather than documented around.

The conditions for READY are narrow and stateable. First, apply the existing
authentication middleware to the mutating routes and take `actorId` from the
verified token rather than the request body, with end-to-end tests covering an
unauthenticated and a wrongly-authenticated caller. Second, reconcile the front
end's API client with the API's actual contract, and prove it with at least one
journey driven through the user interface rather than through the HTTP client.

**What we would say to a stakeholder.** The parts of the system we can
demonstrate do what they claim to do, and we can show the evidence for each
claim. Two things are not yet true. The service will believe whoever asks it,
because the identity check is built but not switched on. And the screens you
have seen are running on sample data, because the user interface and the service
have not yet been connected to each other. Neither is a reason to doubt the work
that exists; both are reasons not to put it in front of the public yet.
