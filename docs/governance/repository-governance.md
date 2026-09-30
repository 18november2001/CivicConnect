4. Project Bootstrap
The bootstrap should give every team member the same starting point. The aim is to avoid a situation where the application works only on one person's machine because of local settings or an undocumented dependency.
4.1 Proposed Repository Structure
CivicConnect/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── types/
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── domain/
│   │   └── config/
│   ├── tests/
│   └── package.json
├── database/
│   ├── migrations/
│   └── seed/
├── documentation/
│   ├── PED/
│   ├── RTM/
│   ├── ADR/
│   ├── risks/
│   └── governance/
├── .gitignore
├── .env.example
└── README.md
This structure is deliberately simple. It gives the frontend, backend, database work and controlled project documentation clear locations without creating a large collection of folders that the team will not actually use.
4.2 Environment Configuration
Environment-specific values should be loaded through environment variables. The repository may contain an .env.example file showing the names that developers need, but actual values must remain on the developer machine or in the deployment environment.
DATABASE_URL=<local-development-database>
JWT_SECRET=<local-development-secret>
PORT=5000
CLIENT_URL=http://localhost:5173
The example file is documentation only. It must not contain a working password, token, API key or production connection string. This continues the M1 security constraint and DEC-002 on synthetic data and safe handling of project information.
4.3 Bootstrap Checks
Check	Expected evidence	Status at M2
Frontend starts locally	Vite development server starts without local-only configuration.	To be verified in repository
Backend starts locally	Express server starts using the documented environment variables.	To be verified in repository
Database connection	Backend can connect to the development PostgreSQL database.	To be verified with database baseline
Environment separation	Real secrets are outside Git history and .env is ignored.	Required
Build	Frontend and backend build commands are documented and repeatable.	Required
Basic test command	A documented command exists for the initial automated tests.	Planned / M2-M3
README	Another team member can follow the setup instructions without asking the author for missing steps.	Required

5. Application / Technical Documentation
The README is treated as part of the application rather than as an afterthought. A developer or assessor should be able to understand what currently exists, install the required tools, start the application and see where the main responsibilities are implemented.
5.1 README Contents
• Project purpose and a short description of the CivicConnect problem.
• Current M2 implementation status and known limitations.
• Required software versions, including Node.js and PostgreSQL.
• Repository structure and a short explanation of the frontend, backend and database directories.
• Installation steps for dependencies.
• Environment variable setup using .env.example.
• Database creation, migration and seed instructions once those scripts are implemented.
• Commands for starting the frontend and backend.
• Commands for running tests and code-quality checks.
• API endpoint documentation where endpoints have been implemented.
• Links to the PED, RTM and relevant ADRs.
• Known issues and TODO items that are intentionally deferred.
5.2 Application Boundaries
Area	Responsibility	Example CivicConnect work
Frontend	Displays information and collects user actions.	Request submission, requester history, staff queue and management dashboard.
API / routes	Defines the HTTP interface and validates requests before business processing.	POST /api/v1/requests and GET /api/v1/requester/requests.
Controllers	Translates an HTTP request into an application operation and returns a response.	Request and assignment controller responsibilities.
Domain / services	Contains rules that should not depend directly on the UI.	Lifecycle transitions, assignment rules and SLA calculations.
Persistence	Reads and writes project data while preserving database rules.	Requests, users, assignments, status history and audit records.
Middleware	Handles cross-cutting concerns around requests.	Authentication, authorization, validation and error handling.

The exact class and module names can change as implementation develops. The important point is that the responsibilities remain clear. This also supports NFR-005 because the business rules can be tested without having to start the entire frontend.
6. Repository Governance
M1 already established that the repository is part of the project's engineering controls. M2 carries the same rules into application development. This is important because the project is now moving from documentation into actual code, database changes and configuration.
6.1 Main Branch Controls
Control	Rule	Purpose
Protected main branch	Direct pushes to main are restricted.	Stops unreviewed work entering the baseline.
Pull request required	Substantive changes enter main through a PR.	Creates a visible review and change history.
Two approvals	Two team members other than the author approve substantive PRs.	Maintains the M1 review standard.
Conversation resolution	Review comments must be addressed before merge.	Prevents known review issues being ignored.
No secrets	Credentials, tokens and sensitive configuration are not committed.	Supports the M1 security constraint.
Meaningful commits	Commit messages should identify the change clearly.	Makes the project history easier to follow.
Issue/requirement link	PRs should reference the relevant issue, requirement or ADR.	Keeps implementation traceable.

GitHub supports protected branches with required pull-request reviews and other merge controls. The two-reviewer rule therefore remains practical for the team's repository, although the project accepts the availability cost already recorded as RSK-004 (GitHub, 2026).
6.2 Branch Naming
Work type	Example
Feature	feature/FR-001-request-submission
Bug fix	fix/FR-001-validation-error
Database	data/TR-10-audit-table
Documentation	docs/ADR-TEC-001-stack
Chore / tooling	chore/setup-eslint

6.3 Pull Request Requirements
• Link the PR to an issue, requirement, ADR or other controlled artefact.
• Explain what changed in plain language.
• State what the reviewers should check.
• Identify any database, configuration, security or documentation impact.
• Include test or verification evidence where available.
• Record material AI assistance in the AI Usage Register before the PR is merged.
• Obtain the required two independent approvals before merging to main.
6.4 .gitignore and Secret Handling
The repository should ignore local environment files, dependency directories and generated build output. At minimum, the project should protect .env files and other local configuration files from accidental commits.
node_modules/
.env
.env.*
!.env.example
dist/
coverage/
*.log
