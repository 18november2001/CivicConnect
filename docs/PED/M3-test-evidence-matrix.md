# Milestone 3 – Test Evidence Matrix

## 1. Purpose

This document records the automated unit-test evidence for CivicConnect Milestone 3.

It links executed tests to the relevant system behaviour and provides supporting evidence for PED v3.0.

## 2. Test Environment

- Project: CivicConnect
- Testing framework: Node.js built-in test runner
- Runtime configured in CI: Node.js 22
- Test command: `npm test`
- CI platform: GitHub Actions
- Workflow: `.github/workflows/ci.yml`
- Pull Request: #30

## 3. Automated Test Results

| Test ID | Functionality verified | Actual result | Status |
|---|---|---|---|
| UT-01 | Publishable transition creates a pending outbox row | Passed | PASS |
| UT-02 | Non-publishable transition creates no outbox row | Passed | PASS |
| UT-03 | Idempotency key remains stable | Passed | PASS |
| UT-04 | Messaging simulator accepts valid messages | Passed | PASS |
| UT-05 | Duplicate message is not sent twice | Passed | PASS |
| UT-06 | Invalid messaging input is rejected permanently | Passed | PASS |
| UT-07 | Simulator supports transient failure testing | Passed | PASS |
| UT-08 | Transition table covers declared states | Passed | PASS |
| UT-09 | Guard thresholds match database constraints | Passed | PASS |
| UT-10 | Request assignment to active staff | Passed | PASS |
| UT-11 | Assignment without staff is rejected | Passed | PASS |
| UT-12 | Assignment to inactive staff is rejected | Passed | PASS |
| UT-13 | Invalid direct transition to resolved is rejected | Passed | PASS |
| UT-14 | Resolution requires a sufficient note | Passed | PASS |
| UT-15 | Rejection requires a sufficient reason | Passed | PASS |
| UT-16 | Closure requires supervisor or admin role | Passed | PASS |
| UT-17 | Citizen cannot control lifecycle transitions | Passed | PASS |
| UT-18 | Terminal states reject further transitions | Passed | PASS |
| UT-19 | Unknown status is rejected | Passed | PASS |
| UT-20 | All failed preconditions are reported | Passed | PASS |
| UT-21 | Staff can reopen a resolved request | Passed | PASS |
| UT-22 | Illegal transition raises the expected error | Passed | PASS |

## 4. Execution Summary

| Metric | Result |
|---|---|
| Total tests executed | 22 |
| Passed | 22 |
| Failed | 0 |
| Skipped | 0 |
| Overall unit-test result | PASS |

The recorded local test execution completed successfully.

### 4.1 Automated Code Coverage

Coverage was measured using the Node.js built-in
test runner with the following command:

`node --experimental-test-coverage --test tests/unit/*.test.js`

| Coverage metric | Actual result |
|---|---|
| Line coverage | 96.38% |
| Branch coverage | 88.00% |
| Function coverage | 70.00% |
| Total unit tests | 22 |
| Passed | 22 |
| Failed | 0 |

The request lifecycle state machine achieved
96.32% line coverage, 80.00% branch coverage
and 100.00% function coverage.

The measured line coverage exceeds the 80%
target specified in NFR-005 for core domain logic.

This report covers the files included in the
executed unit-test run, not necessarily the
entire CivicConnect application.

Overall function coverage is 70.00%, so
additional tests may improve verification of
the messaging integration components.

Evidence: Local Node.js coverage report.


## 5. Requirements Traceability

The following mappings are based on the CivicConnect
Milestone 1 Requirements Traceability Matrix (RTM).

| Requirement ID | Requirement area | Related unit tests | Verification status |
|---|---|---|---|
| FR-005 | Operational assignment and responsibility | UT-10 to UT-12 | Unit-level checks passed; full acceptance pending |
| FR-006 | Controlled request lifecycle FSM | UT-08 to UT-22 | Unit-level checks passed; full acceptance pending |
| NFR-005 | Testability and domain isolation | UT-01 to UT-22 | 22 unit tests passed; measured core FSM line coverage exceeds 80%; full scope verification pending |

The messaging simulation tests UT-01 to UT-07
provide supporting evidence for the messaging
integration boundary defined in the M2 architecture.

They are not mapped to a separate FR in the
current M1 RTM.

These test mappings demonstrate selected unit-level
behaviour only. They do not establish full compliance
with all requirement acceptance criteria.

The remaining functional, integration, security,
performance and end-to-end verification evidence
must be completed and linked separately.
  

## 6. Evidence References

- Local `npm test` terminal results
- GitHub Actions CI execution
- Pull Request #30
- Unit-test source files in `tests/unit/`
- Milestone 2 architecture baseline

## 7. Outstanding Test Evidence

The team must still confirm and document the required black-box functional, API/integration and end-to-end/system tests.

These 22 unit tests do not independently demonstrate that those other test categories have been completed.

