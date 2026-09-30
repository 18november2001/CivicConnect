# M2 Architecturally Significant Requirements (ASRs)

## Purpose

The following Architecturally Significant Requirements were identified from the CivicConnect requirements baseline. These requirements have a direct influence on the architecture because they affect security, data integrity, lifecycle control, performance, reliability, testability, maintainability and external messaging.

## ASR-01: Security and Role-Based Access

**Related requirement:** NFR-001

CivicConnect has different user roles with different permissions. Requesters, staff and management users must only be able to access functions appropriate to their responsibilities.

**Architecture influence:**  
Authentication and authorisation responsibilities must be clearly controlled across the application and protected operations must enforce the correct permissions.

## ASR-02: Data Integrity and Traceability

**Related requirements:** NFR-002, FR-002, FR-003 and FR-005

Request history, assignments and status changes must remain accurate and traceable.

**Architecture influence:**  
Changes to important CivicConnect data must pass through controlled application and domain responsibilities, with persistent history and audit evidence where required.

## ASR-03: Controlled Request Lifecycle

**Related requirement:** FR-006

Service requests must move through defined lifecycle states and invalid transitions must be prevented.

**Architecture influence:**  
Lifecycle rules should be centralised rather than duplicated across different interfaces or components.

## ASR-04: Performance and Responsiveness

**Related requirements:** NFR-003, FR-004 and FR-007

Staff queue operations, filtering and management reporting need to remain responsive enough for practical use.

**Architecture influence:**  
Querying, filtering, pagination and persistence decisions must consider performance. The existing numerical performance threshold remains under review until a realistic and measurable threshold is agreed.

## ASR-05: Reliability and Error Handling

**Related requirement:** NFR-004

Failures should not leave requests or related information in an inconsistent state.

**Architecture influence:**  
The application requires clear error-handling responsibilities and controlled operations where multiple pieces of data may be affected.

## ASR-06: Testability and Domain Isolation

**Related requirement:** NFR-005

Important business rules, especially lifecycle rules, should be verifiable without requiring every external dependency to be available.

**Architecture influence:**  
Core domain logic should remain separated from interface, persistence and external integration concerns where practical.

## ASR-07: Maintainability

**Related requirement:** NFR-006

CivicConnect will continue to evolve through later milestones and therefore needs an architecture that can accommodate controlled changes.

**Architecture influence:**  
Clear module and layer responsibilities are required to reduce unnecessary coupling and make future changes easier to understand and verify.

## ASR-08: Messaging Integration

**Related decision:** M2 controlled change for WhatsApp/SMS interaction

Messaging interaction can no longer simply remain excluded from the project. Where a real external provider is not practical during the current milestone, the interaction may be simulated.

**Architecture influence:**  
Messaging is placed behind a defined integration boundary so that a simulator can be used initially and replaced by a real provider later without tightly coupling provider-specific behaviour to the core CivicConnect domain.

## Architecture Impact

These ASRs were used as decision criteria when comparing the Simple Monolith, Layered Modular Monolith and Microservices alternatives.

The Layered Modular Monolith was selected because it provides clearer separation of responsibilities while keeping development and deployment complexity proportional to the current CivicConnect scope.

The full architecture decision and its trade-offs are recorded in `ADR-ARCH-001-layered-modular-monolith.md`.