# CivicConnect

Community Service Request Management Platform.
SEN381 Software Engineering 381 — Integrated Team Project, Belgium Campus iTVersity, 2026.

## Purpose

A controlled digital platform for submitting, managing, monitoring and reporting on
community service requests, replacing a fragmented process spread across email,
telephone, messaging, spreadsheets and paper records.

## Repository structure

| Path | Contents |
|---|---|
| `docs/PED/` | Project Engineering Document and revision history |
| `docs/requirements/` | Requirements register and Requirements Traceability Matrix |
| `docs/decisions/` | Engineering Decision Log and Architecture Decision Records |
| `docs/risk/` | Risk Register and Forward Engineering Considerations |
| `docs/change/` | Change requests and impact analyses |
| `docs/governance/` | Team Working Agreement, AI Usage Register, baseline sign-off |
| `src/` | Application source (from Milestone 3) |
| `tests/` | Automated tests (from Milestone 3) |

## Engineering controls

- `main` is protected and represents the controlled product state.
- Substantive changes enter `main` only through a Pull Request.
- Two approvals are required, from members other than the author.
- Self-approval is not accepted and administrators cannot bypass these rules.
- No credentials, tokens or keys are committed to this repository.

## Current baseline

PED v1.0 — Engineering Foundation and Requirements Baseline.
