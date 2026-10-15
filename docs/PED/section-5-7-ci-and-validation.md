# 5. CI and Automated Verification

## 5.1 What was introduced and why now

Milestone 1 recorded DEC-003: required status checks were deliberately deferred because the technology stack had not been selected, and a status check with no build or test behind it would have presented the appearance of automated verification while checking nothing. The alternative considered at the time was a placeholder workflow, which was rejected for that reason.

The evidence that decision was waiting for arrived at Milestone 2, when ADR-TEC-001 confirmed Node.js and PostgreSQL. Milestone 3 therefore implements the control. DEC-003 moves from Deferred to Implemented in the Engineering Decision Log, with the closure recorded against the original entry rather than replacing it, so the decision's history remains visible.

The pipeline is defined in `.github/workflows/ci.yml` and runs on every push and every pull request. The base pipeline and the unit test job were built by Student 1; Milestone 3 extends it with static analysis, secret scanning, and a job that stands up a real database.

## 5.2 Pipeline jobs and what each one checks

| Job | Check | What a pass demonstrates | What it does not demonstrate |

|---|---|---|---|

| `unit-tests` | 22 unit and component tests, then `npm audit --audit-level=high` | The lifecycle rules and messaging boundary behave as specified in isolation, and no dependency carries a known advisory at high severity or above as at the time of the run | That the components work together, or that any dependency is free of an undisclosed vulnerability |

| `Static analysis` | ESLint against 20 configured rules | No violation of the configured correctness, asynchronous-handling or maintainability rules exists in the committed source | That the logic is correct. A rule can only find what it was written to look for |

| `Secret scan` | gitleaks across full history | No credential matching a known pattern appears in the repository | A credential in a format the scanner does not recognise |

| `Black-box and integration tests` | Applies all three schema files to an empty PostgreSQL 16 instance, then runs 10 black-box and 9 integration tests | The schema is valid and applies cleanly, and transition atomicity, concurrency control, constraint enforcement and audit immutability hold against a real database | Behaviour under concurrent load, or any behaviour reachable only through an HTTP interface |

Two choices in that configuration were deliberate and are worth defending.

The dependency audit blocks only at high severity and above. A check that fires constantly on low-severity findings becomes a check the team learns to dismiss, at which point it protects nothing.

The lint rules are selected for correctness rather than style. Formatting rules were excluded for the same reason. The rules that were included target the failure modes this codebase is actually exposed to: the lifecycle and messaging code is asynchronous and transactional, so a value silently discarded from a promise executor or a non-atomic update is a defect class worth failing a build over. That selection was vindicated immediately, as section 5.3 describes.

Database application runs as its own job rather than as a step inside the unit test job, so a database problem is distinguishable from a logic failure without reading the log.

## 5.3 The quality gate, and evidence that it blocks

The brief requires that at least one meaningful failure blocks progression. All four jobs are configured as required status checks on `main` in the `main-protection` ruleset, alongside the two approvals already in force since Milestone 1. A failure in any job prevents the merge rather than merely reporting it.

This was not demonstrated with a deliberately broken branch. It did not need to be, because the gate blocked a real defect on its first pull request run.

CI run 28 failed on the integration job while the unit test and secret scan jobs passed. The cause was that the integration test files were being run in parallel by the Node test runner. Both files share a single database and reset shared rows between cases, so concurrent execution caused one file's cleanup to delete rows the other was still using. The suite passed on a two-core development machine, where the files run serially by accident, and failed five of nine cases on the four-core CI runner.

The failure was recorded as DEF-007, the cause was fixed by serialising the integration files, the constraint was documented in the test helper so a later change does not silently remove it, and CI run 34 passed. Run 38 confirms all four jobs green after static analysis was added.

Two things are worth drawing out. First, the defect was in the verification evidence rather than in the product, which is the more dangerous of the two: a suite that passes locally and fails in CI trains a team to distrust the pipeline rather than the suite. Second, the development environment could not have exposed it. No amount of care on a two-core machine would have found a fault that only appears at four-way concurrency. That is an argument for the gate that does not rely on the team having been careless.

ESLint also found a defect on its first run, recorded as DEF-005: a value returned from a promise executor in `simulatedMessagingAdapter.js`, which is discarded silently and conceals a returned promise if the body ever changes.

## 5.4 What a green pipeline does and does not allow us to conclude

It allows us to conclude that the schema applies cleanly to an empty PostgreSQL 16 database, that 41 specified behaviours hold, that no configured lint rule is violated, that no high-severity dependency advisory is present, and that no recognisable credential has been committed.

It does not allow us to conclude that the system is correct. The suite verifies the behaviours the team thought to specify. It cannot verify a requirement nobody wrote a test for, it does not exercise any HTTP interface because none exists, and it says nothing about behaviour under realistic load.

Coverage percentage is deliberately not reported. The suite is selected by risk, and a percentage would imply a completeness the selection does not claim.

## 5.5 Evidence location

| Evidence | Where |

|---|---|

| Pipeline definition | `.github/workflows/ci.yml` |

| Lint configuration and rule selection | `eslint.config.js` |

| Required status check configuration | Settings, Rules, `main-protection` ruleset |

| Gate blocking a real defect | CI run 28, `https://github.com/18november2001/CivicConnect/actions/runs/38777179222` |

| The same gate passing after the fix | CI run 34, `https://github.com/18november2001/CivicConnect/actions/runs/38779979468` |

| All four jobs green | CI run 38, `https://github.com/18november2001/CivicConnect/actions/runs/38784961372` |

| Defect records | `docs/quality/defect-register.md` |

# 7. Black-Box, Integration and System Validation

## 7.1 How the suite was selected

Tests were chosen from risk, not from a target count. Three sources drove the selection: the risks already recorded in the project register, the claims made in the PED that had no evidence behind them, and the transitions a user interface would never offer but an API caller could still attempt.

That third category matters most. R-ARCH-02 records the risk that lifecycle rules become duplicated across components, and R-DES-01 records that the state machine can be bypassed by a direct write. Both are about a path nobody intended existing anyway, so the suite deliberately attempts those paths.

## 7.2 Techniques applied and why the behaviour required them

**State transition testing.** The request lifecycle is an explicit state model with six states and eleven legal transitions. Expected behaviour depends entirely on current state, which is the condition that makes this technique appropriate rather than decorative. Applied in BB-01 for the valid path, BB-02 for seven invalid pairs, and BB-03 for terminal state protection.

**Boundary value analysis.** Two numeric thresholds govern acceptance: a resolution note of at least 20 characters and a rejection reason of at least 15. Each is tested at the value, one below and one above. These boundaries carry extra weight because the same numbers appear in the application guards and in the database CHECK constraints, and a divergence between the two layers would surface to a user as an unexplained error. Applied in BB-04 and BB-05.

**Decision table testing.** Closure authority depends on two conditions combining: the actor's role and the request's current state. Neither alone determines the outcome, which is what makes a combination technique necessary. Applied in BB-06 across five rule combinations, and in BB-10 for the error reporting behaviour when several preconditions fail together.

Techniques not used were not used because the behaviour did not call for them. Equivalence partitioning adds nothing where the input domain is a closed enumeration already covered exhaustively by the state transition cases.

## 7.3 Integration scope and critical scenarios

Integration tests run against a real PostgreSQL instance rather than a substitute, because the behaviour under test is precisely what a fake cannot reproduce: transactional rollback, constraint enforcement and privilege checks.

| Scenario | Why it is critical | Record |
|---|---|---|
| A permitted transition commits status, audit, timeline and outbox together | PED v2.0 section 34.4 recorded this atomicity claim as unproven. It was the project's largest verification gap. | TER-05 |
| A refused transition leaves nothing behind | An audit record for a transition that did not happen is a data integrity defect against NFR-002, and preventing it is why ADR-DES-002 uses a two-phase dispatcher. | TER-06 |
| A stale write is rejected | Lost updates are invisible in normal use and surface only as a disputed record later. | TER-07 |
| The database refuses a bad value when the application is bypassed | Verifies the second layer of validation independently of the first. | INT-04 |
| The audit log cannot be modified by the application role | A privilege claim can only be verified by attempting the forbidden operation as the restricted role. | TER-08 |
| The restriction is targeted, not blanket | A control that blocks everything is indistinguishable from a broken connection. | TER-09 |
| A duplicate outbox key is absorbed | Dispatch is at-least-once, so the unique key is the only thing preventing a duplicate message to a citizen. | TER-10 |

## 7.4 Results

| Suite | Cases | Result |
|---|---|---|
| Unit and component | 22 | Pass |
| Black-box functional | 10 | Pass |
| Integration and persistence | 9 | Pass |
| **Total** | **41** | **Pass** |

Against the Milestone 3 minimum: unit 22 against 5, black-box 10 against 5, integration 9 against 3, negative and unauthorised cases 8 against 3, black-box techniques 3 against 2. End-to-end system cases remain at 0 against a minimum of 2.

Execution evidence is CI run 38. Full records are in `docs/quality/test-evidence-records.md`, which gives test basis, selection reasoning, technique, inputs, expected and actual results, traceability and interpretation for each significant case.

## 7.5 What this verification does not demonstrate

Stated here rather than left for an assessor to discover.

There is no end-to-end journey, because the system has no HTTP interface. Every test reaches the domain and persistence layers directly. A complete user journey across an integrated system has not been verified. This is the milestone's largest outstanding gap and it is a team-level dependency rather than a verification one.

Concurrency is simulated sequentially. TER-07 constructs the stale-version condition deliberately rather than running genuine parallel load, so it verifies the version check logic and not the behaviour of the database under contention. DEF-007 is a reminder of the difference: a fault that only appears under genuine concurrency went undetected until an environment with more cores ran the same code.

The messaging provider is simulated. No test exercises a real WhatsApp or SMS provider, as recorded in ADR-INT-001.

Partial subscriber failure is untested. The suite covers a refused transition and a successful one, not a subscriber that fails midway through the transactional phase.

The audit immutability control protects against the application role. It does not protect against an actor holding database owner or superuser rights, which remains a stated residual risk.

No performance evidence exists. No operation has been measured against a stated workload.

---

# 9. Defects and Quality Interpretation (contribution)

Seven defects were recorded during Milestone 3 verification. The full register is in `docs/quality/defect-register.md`. Three are worth drawing out here.

**DEF-001, critical, fixed.** `migrations/Core_Schema.sql` line 1 read `CREATE EXTENSION IF NOT EXIST` rather than `IF NOT EXISTS`. PostgreSQL aborts on that statement, so no table had ever been created. The entire persistence baseline documented at Milestone 2 had never been executed, and every persistence claim in the PED was therefore unverified.

**DEF-003, high, fixed.** `migrations/Indexes_and_Security.sql` was an empty file. The PED described four composite indexes supporting NFR-003 and REVOKE statements making the audit log immutable for NFR-002. Neither existed. The NFR-002 immutability claim appeared in the PED and in ADR-DES-002 and was not true of the repository.

**DEF-007, medium, fixed.** Integration test files were being run in parallel against a shared database, so one file's cleanup removed rows another was using. Found by the quality gate on its first pull request run, on a four-core runner, having passed on a two-core development machine.

**Interpretation.** Four of the seven defects were found by attempting to run something for the first time, not by a test failing. DEF-001 and DEF-003 were both present throughout Milestone 2 and were not detected, because no automated check and no deployment ever exercised the schema.

That is the strongest available argument for the gate introduced in section 5. The project did not lack care. It lacked a step that would have failed.

DEF-005 and DEF-007 make a second and different point. Both were found by the new gate itself, on its first run, and neither was reachable from a developer's machine: one required a rule nobody had configured before, the other required hardware the team does not have. A control is worth adding when it can see something the people cannot.

DEF-004 remains open: `outbound_messages` and `messaging_outbox` both exist for the same purpose, and only the latter is written by any code. No functional failure results today, but a dead table contradicting the documented design will mislead a future developer, and the proposed removal is pending a team decision.
