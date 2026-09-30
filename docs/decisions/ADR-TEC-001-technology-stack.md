3. Technology Stack Decision
3.1 Selection Criteria
The team considered the following points before selecting the stack:
• Fit with the CivicConnect requirements and the existing M1 RTM.
• Team familiarity and the amount of new technology the project would need to learn.
• Security and support for authentication, authorization, validation and safe error handling.
• Ability to support the relational request, assignment, status and audit data already described in M1.
• Maintainability across the remaining milestones.
• Compatibility with free or low-cost development and deployment options.
• Availability of current, authoritative documentation and a stable release/support cycle.
• Ease of testing and keeping the business rules separate from infrastructure.
3.2 Options Considered
Area	Option considered	Reason considered	M2 position
Frontend	React	Good fit for separate requester, staff and management views and supports component-based UI development.	Selected
Frontend alternative	Server-rendered Express/EJS	Would reduce the number of technologies, but would make the dashboard-style interface less separated from backend code.	Not selected
Backend	Node.js + Express	Matches the team's existing JavaScript/Node experience and provides a straightforward HTTP/API layer.	Selected
Backend alternative	ASP.NET Core	Strong framework, but adds a different runtime and language/tooling path for the project.	Not selected
Database	PostgreSQL	Fits the structured relationships between users, requests, assignments, statuses and audit records.	Selected
Database alternative	MongoDB	Flexible document model, but the project already has several related entities and integrity rules.	Not selected
Language	TypeScript	Adds static typing to the JavaScript stack and helps keep interfaces consistent between modules.	Selected
Build tool	Vite	Provides a current development/build workflow for the React frontend.	Selected

3.3 Selected M2 Stack
The proposed M2 stack is a TypeScript-based web application using React on the frontend, Node.js with Express on the backend, and PostgreSQL for persistence. Vite is used for the React frontend build and development workflow. GitHub remains the controlled repository and collaboration platform.
Component	Selected technology	M2 baseline / reason
Frontend	React 19.3	Component-based interface for requester, staff and management screens.
Frontend tooling	Vite 8.1	Development server and production build tooling for the frontend.
Language	TypeScript 6.0	Shared typed language across frontend and backend code.
Backend runtime	Node.js 24 LTS	Supported LTS runtime suitable for the project schedule.
Backend framework	Express 5.x	Routing, middleware and HTTP API responsibilities.
Database	PostgreSQL 18.6	Relational storage for requests, users, assignments, statuses and audit history.
Package management	npm	Simple package installation and lockfile-based dependency control.
Repository	GitHub	Source control, pull requests, review and branch protection.
Testing	Vitest + Supertest	Initial unit/API verification direction; exact test coverage will grow through M3.
Code quality	ESLint + Prettier	Consistent code style and static checks as development expands.

3.4 Why This Stack Fits CivicConnect
The main reason for using this stack is that it keeps the application relatively simple while still giving the team clear boundaries. React handles the user-facing screens, Express handles HTTP requests and middleware, and PostgreSQL owns the structured project data. The team does not need separate microservices just to demonstrate architecture.
PostgreSQL is particularly important because the M1 requirements already describe relationships and integrity rules between users, requests, assignments, status changes and audit records. PostgreSQL 18 is currently a supported major release, and the project can stay on a fixed minor release during the milestone rather than changing database versions while development is underway (PostgreSQL Global Development Group, 2026).
Node.js 24 is an LTS release, which is a better fit for a student project that needs a stable runtime during the remaining milestones. Express 5 also supports the middleware and routing model needed for the API (Node.js, 2026; Express.js, 2026).
React 19.3 and Vite 8.1 are current releases at the time of the M2 baseline. Vite provides the frontend development and build workflow, while React provides the component model for the different CivicConnect user views (React, 2026; Vite, 2026).
3.5 ADR-TEC-001: Technology Stack
Field	Decision
Context	CivicConnect needs a maintainable web application that supports the M1 requirements and can be developed by a three-person team within the academic schedule.
Options	React/Node/PostgreSQL; server-rendered Express/EJS; ASP.NET Core with a relational database; Node with MongoDB.
Decision	Use React + Vite + TypeScript for the frontend, Node.js 24 LTS + Express 5.x + TypeScript for the backend, and PostgreSQL 18.6 for persistence.
Reason	The stack fits the existing requirements, keeps the architecture understandable, supports relational integrity, and avoids adding unnecessary infrastructure.
Trade-off	The team now has separate frontend and backend projects and must manage API contracts. PostgreSQL also requires more explicit schema design than a document store.
Affected evidence	FR-001 to FR-008, NFR-001 to NFR-006, RTM entries TR-01 to TR-14.
Status	M2 baseline decision, subject to controlled change if later evidence shows a compatibility problem.
