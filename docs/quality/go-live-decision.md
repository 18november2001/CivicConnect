# CivicConnect Go-Live Decision Record

**Owner:** Student 4
**Decision point:** Milestone 4 final submission
**Status:** Draft, to be concluded against the final release baseline

This record states the decision criteria before the decision is made, so that
the outcome is reached from evidence rather than assembled afterwards to justify
whatever happened to be finished. The M4 brief is explicit that a well-evidenced
no-go can earn strong marks and that remaining in staging because work was not
completed is not an engineering precaution.

---

## 1. The three available states

| State | What it requires |
|---|---|
| Production | A real deployment with controlled secrets, production configuration, deployment evidence and post-deployment verification |
| Simulated production | A production-like environment separated from development, with release identification, production-like configuration, controlled secrets and deployment verification |
| Staging, no-go | A specific blocking concern, the affected requirement or risk, the likely consequence of releasing, and what must be resolved first |

---

## 2. Decision criteria, set in advance

A release is recommended only if every criterion below is satisfied. Each one
is a question with an evidence source, not a judgement call.

| # | Criterion | Evidence source | Status |
|---|---|---|---|
| C1 | One integrated product exists on `main` at an identified tag | Repository, release tag | **Not met** |
| C2 | The critical citizen journey works end to end | `npm run test:e2e`, TER-11 | Blocked by C1 |
| C3 | The messaging boundary dispatches rather than queueing silently | `npm run dispatch`, MSG-01 to MSG-07 | **Met** |
| C4 | The schema applies cleanly to an empty database | CI job `blackbox-and-integration` | **Met** |
| C5 | Audit records cannot be altered by the application role | TER-08, TER-09 | **Met** |
| C6 | No high-severity dependency advisory, no committed secret | `npm audit`, gitleaks, both required checks | **Met** |
| C7 | The caller's identity is verified before a lifecycle action | Authentication middleware applied to the mutating routes | **Not met** |
| C8 | No critical defect is open | Defect Register | **Not met**, DEF-008 open |

---

## 3. Current assessment

**Recommendation at the time of writing: NO-GO for production. Proceed to
simulated production only once C1 and C8 are satisfied.**

Three criteria are unmet and they are not equal in weight.

### C7 is the one that would block a real release

An authentication layer exists. `src/middleware/auth.js` verifies a signed
token, and `routes/authRoutes.js` issues one. No route applies the middleware,
so every mutating endpoint still accepts `actorId` from the request body.

The consequence is specific. The lifecycle authority rules are correct and
proven: TER-12 shows a citizen is refused a supervisor's action at the API
boundary. But that refusal is enforced against a role the caller declared about
themselves. Anyone able to reach the service can close any request by claiming
to be a supervisor.

A system whose purpose is to record what a municipality was asked to do, and
what it did, cannot be released publicly while it will believe whoever asks.
This is the stated condition on the release, not a nice-to-have.

**Affected requirement:** FR-006 role authority, and NFR-002 audit integrity,
since an audit record attributes an action to an unverified actor.

**Remediation:** apply `requireAuth` to the mutating routes, take `actorId`
from the verified token rather than the body, and add end-to-end cases for an
unauthenticated caller and a caller whose token carries a different role.
Estimated as small, because the middleware already exists.

### C1 and C8 are completion, not safety

The backend and frontend branches are not merged, so no integrated product
exists to deploy, and DEF-008 means the API cannot start on Linux at all. These
are reasons the release is not ready; they are not reasons a release would be
unsafe. The brief distinguishes the two, and so does this record: remaining in
staging because work was not finished is not an engineering precaution.

### What is genuinely ready

The persistence layer, the lifecycle engine and the messaging boundary are
verified to a standard that would support a release. The schema applies cleanly
and is checked on every pull request, every transition is audited atomically,
the audit record cannot be altered by the application role, and the outbox now
demonstrably drains. Forty-six specified behaviours hold, and the gate that
checks them has been shown to block a merge rather than merely report.

---

## 4. Decision to be recorded at the go-live point

Complete this section at submission, against the final release baseline.

| Field | Entry |
|---|---|
| Final deployment state | *Production / Simulated production / Staging no-go* |
| Release tag and commit | |
| Criteria met at decision | |
| Criteria unmet at decision | |
| Blocking concern, if no-go | |
| Affected requirement or risk | |
| Consequence of releasing anyway | |
| Required before production | |
| Decision taken by | |
| Date | |

---

## 5. Residual risks carried into any release

These remain true even if every criterion above is met, and would be carried
into a production deployment as accepted risk.

| ID | Risk | Consequence | Why accepted |
|---|---|---|---|
| R-SEC-01 | Caller identity unverified until C7 is closed | Any caller can act as any role | Blocking; not accepted, must be closed |
| R-INT-01 | The front end has never been connected to the API | No journey has been demonstrated through the user interface | Carried; the HTTP journey is verified, the UI journey is not |
| R-MSG-01 | Messaging provider is simulated | No real message has ever been delivered | Accepted; recorded in ADR-INT-001 since M2 |
| R-MSG-02 | Recipient addressing uses e-mail because no phone column exists | A real provider integration needs a schema change | Accepted; stated rather than worked around |
| R-AUD-01 | Audit immutability protects against the application role only | A database owner or superuser can alter audit records | Accepted; stated limitation of a REVOKE-based control |
| R-PERF-01 | One performance exercise, sequential, synthetic data | Behaviour under concurrency is unmeasured | Accepted; M4 requires no new performance programme |
| R-OPS-01 | No monitoring, alerting, backup or restore procedure | A failed dispatch sets `last_error` and nothing watches it | Accepted; outside M4 scope, stated so it is not inferred |
