2. Connection to the M1 Baseline
The technology decision is based on the M1 requirements rather than being chosen separately from the project. For example, FR-001 to FR-008 require a web interface and server-side processing, while NFR-001 to NFR-006 introduce stronger requirements around access control, data integrity, performance, error handling, testability and maintainability.
The M1 RTM also gives the team a starting point for the technology decision. The existing placeholders include request submission and tracking interfaces, authentication middleware, an append-only audit table, database indexes, a global exception handler and a testable domain layer. The M2 stack needs to support these responsibilities without creating unnecessary complexity.

9. Forward Engineering Considerations
FE-08 — Dependency Management
As more packages are added, dependency choices can become a maintenance problem. The team should avoid adding a package for a small task when the same result can reasonably be achieved with the selected stack. Dependency updates should be reviewed rather than applied automatically.
FE-09 — Runtime and Version Support
The team should keep the Node.js, React, Vite, TypeScript and PostgreSQL versions recorded in the README and project configuration. A later major-version upgrade should be handled as a controlled change because it could affect the build or application behaviour.
FE-10 — Deployment Environment
The final hosting environment is still open. Before deployment, the team needs evidence about runtime support, database hosting, HTTPS, environment variables, backups and cost. The application should not depend on a provider-specific feature unless that dependency is recorded.
FE-11 — CI Checks
M1 deliberately deferred required CI status checks because the technology stack had not yet been selected. Now that the stack is defined, the team can introduce build, lint and test checks. Required merge gates should only be enabled once the workflow is actually working.
FE-12 — Operational Logging
CivicConnect needs enough logging to understand failed requests and application problems without writing passwords, tokens or private request information into logs. The exact logging and alerting setup can be finalised when deployment is clearer.
10. M2 Traceability from Requirement to Engineering Evidence
The following examples show how Person 3's work connects to the existing M1 traceability rather than standing as a separate technology report.
Requirement	M2 technology / governance decision	Application evidence	Verification
FR-001 Request Submission	React frontend + Express API; documented endpoint boundary.	Request submission page and POST request implementation.	Functional test planned / initial test when implemented.
FR-004 Staff Queue	React dashboard + PostgreSQL indexed queries.	Staff queue module and query implementation.	Functional and performance verification planned.
FR-006 Lifecycle FSM	Business rules kept in backend/domain layer rather than UI-only logic.	Lifecycle service / domain module.	Unit tests for legal and illegal transitions planned.
NFR-001 Security	Authentication and role checks handled through backend middleware.	Auth middleware and authorization layer.	RBAC and privilege-isolation tests planned.
NFR-002 Data Integrity	PostgreSQL selected for relational integrity and controlled audit persistence.	Database migrations and audit persistence.	Database integrity checks planned.
NFR-005 Testability	TypeScript and separated domain/service responsibilities.	Domain/service modules isolated from UI and database drivers.	Unit tests planned for core business rules.
NFR-006 Maintainability	GitHub PR controls, linting, formatting and documented structure.	Repository configuration and review evidence.	Build/lint checks and PR review evidence.

10.1 Example End-to-End Trace
FR-001 requires a requester to submit a structured service request. The M2 architecture gives the frontend responsibility for collecting the information and the Express API responsibility for receiving and validating the request. PostgreSQL is responsible for storing the request and its relationship to the requester. The repository structure separates these responsibilities so the business logic can be tested without depending on the browser. The implementation evidence will be the request form, API route/controller, service logic and database migration. Verification will then check the acceptance criteria from FR-001.
