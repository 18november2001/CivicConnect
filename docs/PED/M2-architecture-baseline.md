# Milestone 2 Architecture Baseline

## 1. Purpose

This document records the CivicConnect architecture baseline established during Milestone 2. It continues from the Milestone 1 engineering baseline rather than replacing it.

The M1 requirements, constraints, risks, traceability information and engineering decisions were reviewed before the M2 architecture was selected.

The detailed architecture decision is recorded in `ADR-ARCH-001-layered-modular-monolith.md`.

## 2. Architecture Drivers

The architecture is influenced by the Architecturally Significant Requirements identified for CivicConnect:

- ASR-01: Security and Role-Based Access
- ASR-02: Data Integrity and Traceability
- ASR-03: Controlled Request Lifecycle
- ASR-04: Performance and Responsiveness
- ASR-05: Reliability and Error Handling
- ASR-06: Testability and Domain Isolation
- ASR-07: Maintainability
- ASR-08: Messaging Integration

These ASRs are documented in
`docs/requirements/M2-architecturally-significant-requirements.md`.

## 3. Architecture Alternatives Considered

### 3.1 Simple Monolith

A simple monolith would provide straightforward development and deployment. However, it provides weaker separation between lifecycle rules, security, reporting, persistence and messaging responsibilities.

### 3.2 Layered Modular Monolith

A layered modular monolith keeps CivicConnect as one deployable application while separating major responsibilities into clear logical areas.

This provides stronger separation and testability without introducing unnecessary distributed-system complexity.

### 3.3 Microservices

Microservices would allow individual services to be deployed and scaled independently. However, this would introduce additional networking, deployment, monitoring, failure-handling and data-consistency complexity.

The current CivicConnect requirements do not provide sufficient justification for introducing this additional complexity.

## 4. Selected Architecture

CivicConnect will use a **Layered Modular Monolith** architecture for the Milestone 2 baseline.

The architecture consists of the following logical responsibilities:

### Presentation / Interface

Provides the interfaces used by requesters, staff and management.

Examples include:

- Request submission
- Request tracking
- Staff queue
- Management dashboard

### Application / Services

Coordinates application use cases and communication between the interface and core business responsibilities.

Key responsibilities include:

- Request Service
- Assignment Service
- Lifecycle Service
- Reporting Service

### Domain / Business Logic

Contains the core CivicConnect business rules.

The controlled request lifecycle is particularly important because request state transitions must follow the approved lifecycle rules and invalid transitions must be prevented.

### Persistence / Infrastructure

Provides persistent storage and infrastructure responsibilities for information such as:

- Users
- Requests
- Assignments
- Request history
- Audit information

The detailed persistence decision is maintained as part of the team's M2 data and persistence work.

### Messaging Integration

WhatsApp/SMS interaction is placed behind a defined integration boundary.

A simulated messaging component may be used during the current milestone where a real external provider is not practical. This allows a future provider to replace the simulator without requiring major changes to the core CivicConnect domain.

## 5. Logical Architecture

The main logical flow is:

Presentation / Interface  
↓  
Application / Services  
↓  
Domain / Business Logic  
↓  
Persistence / Infrastructure

The Application / Services layer also communicates with the Messaging Integration boundary where messaging behaviour is required.

These are **logical responsibilities and boundaries**, not separate physical servers.

Technology-specific implementation decisions are documented separately from the logical architecture.

## 6. Architecture Assumptions and Dependencies

### A-ARCH-01
CivicConnect will initially operate as one deployable application.

This assumption should be reconsidered if later scalability or deployment evidence shows that independent deployment is required.

### A-ARCH-02
WhatsApp/SMS behaviour may initially be simulated.

The integration boundary should allow the simulator to be replaced by a real provider later.

### A-ARCH-03
The current expected project scope does not justify a distributed microservices architecture.

This should be reviewed if workload, deployment or operational requirements materially change.

### D-ARCH-01
Implementation of the architecture depends on the final M2 technology-stack decision.

### D-ARCH-02
Persistence implementation depends on the team's M2 data and persistence baseline.

## 7. Architecture Risks

The following architecture-related risks were identified:

- Layer responsibilities may become unclear during implementation.
- Lifecycle rules may become duplicated across components.
- Messaging simulation may behave differently from a future external provider.
- Access-control responsibilities may be implemented inconsistently.
- An unsupported performance threshold could lead to unrealistic architecture expectations.

These risks should remain visible in the evolving project Risk Register and be updated as implementation evidence becomes available.

## 8. Forward Engineering Considerations

### Testability
Separation of domain logic from interfaces and infrastructure should make lifecycle and validation rules easier to verify independently.

### Performance
Database queries, filtering, pagination and reporting should be reviewed against the final measurable performance requirement.

### Deployment
The modular monolith provides a simpler initial deployment model while maintaining internal separation of responsibilities.

### Maintainability
Clear boundaries between responsibilities should reduce unnecessary coupling as CivicConnect evolves.

### Security
Authentication and authorisation responsibilities must remain consistently enforced across protected operations.

### Messaging
The messaging boundary should allow the simulated integration to be replaced by a real provider without redesigning the core domain.

## 9. Baseline Status

**Baseline:** Architecture, Technology & Initial Design Baseline  
**PED Version:** v2.0  
**Baseline Date:** 30 September 2026  
**Architecture:** Layered Modular Monolith  
**Architecture ADR:** ADR-ARCH-001  
**Performance Threshold:** Under Review  
**Status:** Pending Team Approval

The architecture portion of the baseline is defined in this document. The final M2 baseline also depends on the team's approved data/persistence, technology and initial-design decisions.

Any material architecture change after baseline approval must follow the project's controlled change process and update the affected ADRs, requirements traceability, risks and related engineering evidence.