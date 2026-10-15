# Milestone 3 – Construction, Quality and CI Evidence

## 1. Purpose

This document records the construction, automated verification and security-checking evidence produced during CivicConnect Milestone 3.

It builds on the Milestone 2 architecture baseline and supports the preparation of PED v3.0.

## 2. Architecture Alignment

CivicConnect follows the Layered Modular Monolith architecture selected during Milestone 2.

The implementation is intended to preserve separation between application services, domain rules, persistence and messaging integration.

The automated unit tests provide evidence for selected domain responsibilities, including request lifecycle validation and simulated messaging behaviour.

## 3. Automated Unit Testing

The CivicConnect project uses Node.js automated testing through the `npm test` command.

**Recorded local test execution:**

- Total tests: 22
- Passed: 22
- Failed: 0
- Status: PASS

The executed tests cover:

- Request lifecycle transitions and validation
- Staff assignment conditions
- Request resolution and rejection requirements
- Role restrictions on lifecycle operations
- Messaging outbox behaviour
- Simulated messaging and idempotency

These results demonstrate successful verification of the tested components. They do not establish that all end-to-end system requirements have been tested.

## 4. Continuous Integration

A GitHub Actions workflow is configured in:

`.github/workflows/ci.yml`

The workflow performs:

1. Source-code checkout
2. Node.js 22 setup
3. Dependency installation using `npm ci`
4. Automated unit testing using `npm test`
5. Dependency security auditing using `npm audit --audit-level=high`

The workflow runs on pushes and pull requests.

## 5. Dependency Security Verification

A dependency security audit was executed using:

`npm audit --audit-level=high`

**Recorded result:**

- 19 moderate-severity vulnerability findings
- No high- or critical-severity findings reported in the supplied output
- The audit completed without triggering the configured high-severity failure threshold

The initial audit identified 19 moderate-severity vulnerability findings associated with the Jest dependency chain.

Following the removal of the unused Jest dependency, a subsequent `npm audit` reported zero vulnerabilities. All 22 existing automated unit tests passed after remediation.

The remediation and local verification results are documented in Section 9. CI verification and pull request review remain pending.

## 6. GitHub Pull Request Evidence

**Pull Request:** #30

**Title:** M3: Add automated unit tests and GitHub Actions CI

**Branch:** `feature/m3-student1-quality-ci`

The pull request contains the CI configuration changes and associated test-command configuration.

The GitHub Actions checks have passed in the screenshots reviewed.

**Merge status:** Merged into `main`.

## 7. Outstanding Verification Work

- Obtain the required approving reviews for Pull Request #31 and the security-remediation pull request when opened.
- Record the final merged commit identifier.
- Complete CI verification and pull request review for the dependency security remediation documented in Section 9.
- Confirm implementation alignment with the approved architecture.
- Link functional, API/integration and end-to-end test evidence produced by the team.
- Add relevant evidence to the Milestone 3 traceability and defect records.

## 8. Evidence References

- GitHub Pull Request #30
- GitHub Actions successful unit-test execution
- Local terminal output showing 22 passing tests
- Dependency audit output showing 19 moderate-severity findings
- Milestone 2 architecture baseline
- Relevant requirement and risk registers
- Local npm audit output showing 0 reported vulnerabilities after Jest removal
- Local terminal output confirming 22 passing unit tests after dependency remediation


## 9. Dependency Security Audit and Remediation

### 9.1 Initial Security Findings

**Tool:** npm audit

**Initial result:** 19 moderate-severity vulnerability findings.

The audit identified a vulnerable `sprintf-js` dependency introduced through the Jest development dependency chain.

The findings were associated with a potential denial-of-service vulnerability involving unbounded precision specifiers.

### 9.2 Remediation

The project uses Node.js's built-in test runner for its existing automated unit tests.

A project search found no Jest-specific test code in the checked files. Jest was therefore removed from the development dependencies.

**Remediation command:** `npm uninstall jest --save-dev`

**Result:** 336 packages removed, with `package.json` and `package-lock.json` updated.

The `supertest` development dependency was retained for potential API integration testing.

### 9.3 Local Verification

| Verification | Result |
|---|---|
| Initial npm audit | 19 moderate-severity findings |
| npm audit after remediation | PASS — 0 reported vulnerabilities |
| npm test after remediation | PASS — 22 tests passed, 0 failed |

### 9.4 Security Conclusion

Removing the unused Jest dependency eliminated the 19 previously reported moderate-severity vulnerability findings from the audited dependency tree.

All 22 existing automated unit tests continued to pass after the dependency change.

The subsequent `npm audit` reported zero known dependency vulnerabilities. This result does not establish that the entire application is free of security vulnerabilities.

GitHub Actions verification completed successfully for Pull Request #32 following the removal of the unused Jest dependency. The configured CI checks passed, providing automated verification of the updated dependency configuration.

Pull Request #32 remains open pending the required approving reviews before merging into `main`.


