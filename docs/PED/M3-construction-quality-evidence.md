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

The findings include a vulnerable `sprintf-js` dependency reached through the Jest dependency chain.

The findings remain open for assessment. The team should review compatible dependency updates and avoid applying breaking changes without regression testing.

## 6. GitHub Pull Request Evidence

**Pull Request:** #30

**Title:** M3: Add automated unit tests and GitHub Actions CI

**Branch:** `feature/m3-student1-quality-ci`

The pull request contains the CI configuration changes and associated test-command configuration.

The GitHub Actions checks have passed in the screenshots reviewed.

**Merge status:** Merged into main after two approving reviews and successful CI checks (PR #30).

## 7. Outstanding Verification Work

- Record the final merged commit identifier.
- Assess and document the moderate dependency vulnerabilities.
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

## 9. Static Code-Quality Verification

**Tool:** ESLint

**Command:** `npm run lint`

**Scope:** JavaScript source files in `src/` and automated tests in `tests/`.

**Execution environment:** Local development environment and GitHub Actions CI.

**Result:** PASS — ESLint completed successfully without reporting lint errors.

**Evidence:** GitHub Pull Request #31, successful `unit-tests` GitHub Actions job, including the `Static code-quality check` step.

**Quality conclusion:** Automated static code-quality verification has been added to the CI pipeline. This check helps detect code-quality issues before changes are merged into `main`.