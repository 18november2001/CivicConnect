# ADR-ARCH-001: Layered Modular Monolith Architecture

## Status
Proposed for Milestone 2 baseline approval

## Context
CivicConnect needs to support request submission, request tracking, staff assignment, controlled lifecycle transitions, management reporting and messaging integration.

The architecture must provide clear separation of responsibilities while remaining manageable for the current project scope and team. The architecture also needs to support the ASRs identified for security, data integrity, lifecycle control, performance, reliability, testability, maintainability and messaging integration.

## Decision Drivers
The architecture is influenced by the following ASRs:

- ASR-01: Security and Role-Based Access
- ASR-02: Data Integrity and Traceability
- ASR-03: Controlled Request Lifecycle
- ASR-04: Performance and Responsiveness
- ASR-05: Reliability and Error Handling
- ASR-06: Testability and Domain Isolation
- ASR-07: Maintainability
- ASR-08: Messaging Integration

Other considerations include the project schedule, team capability, deployment complexity and future development requirements.

## Alternatives Considered

### Simple Monolith
A simple monolithic application would be easier to develop initially and would have low deployment complexity. However, it could lead to weak separation between lifecycle logic, security, reporting, persistence and messaging responsibilities.

### Layered Modular Monolith
A layered modular monolith keeps CivicConnect as one deployable application while separating presentation, application services, domain logic, persistence and integration responsibilities.

This provides clearer boundaries without introducing unnecessary distributed-system complexity.

### Microservices
A microservices architecture would allow services to be independently deployed and scaled. However, it would introduce additional networking, deployment, monitoring, failure-handling and data-consistency complexity that is not currently justified by the CivicConnect requirements.

## Decision
CivicConnect will use a **Layered Modular Monolith** architecture for the Milestone 2 baseline.

The main logical responsibilities are:

- Presentation / Interface
- Application / Services
- Domain / Business Logic
- Persistence / Infrastructure
- Messaging Integration

The messaging integration will remain behind a defined boundary so that a simulated WhatsApp/SMS implementation can later be replaced by a real provider without requiring major changes to the core domain logic.

## Rationale
The layered modular monolith provides a balance between separation of responsibilities and manageable implementation complexity.

It supports the current CivicConnect ASRs while avoiding the additional operational complexity of microservices. It also provides clearer separation than an unstructured monolithic design.

## Trade-offs
The selected architecture introduces several trade-offs:

- Module and layer boundaries must be maintained consistently.
- The application remains a single deployment unit.
- Individual modules cannot be independently deployed or scaled.
- Poor implementation discipline could still create coupling between modules.

These trade-offs are considered acceptable for the current CivicConnect scope.

## Risks
- Layer boundaries may become unclear during implementation.
- Lifecycle rules could become duplicated across components.
- Messaging simulation may behave differently from a future real provider.
- Access-control responsibilities may be implemented inconsistently.

These risks will be monitored through the project Risk Register and controlled development process.

## Consequences
Future CivicConnect development should follow the responsibilities defined by this architecture.

Architecture-related implementation, persistence, interfaces and integrations should remain traceable to the relevant requirements, ASRs and engineering decisions.

Any material change to this architecture after baseline approval must be recorded through the project's change-control and ADR process.