7. Deployment Compatibility
M2 does not require CivicConnect to be production deployed. The team does, however, need to make sure that the technology choices do not create an obvious deployment problem later.
Concern	Current M2 direction	Later evidence needed
Runtime	Use Node.js 24 LTS for development and keep the deployment runtime aligned.	Confirm hosting provider supports the selected Node version.
Frontend	Build React application into deployable static assets.	Confirm hosting for static frontend assets and HTTPS.
Backend	Run Express as the application server.	Confirm process startup, environment variables and health checking.
Database	PostgreSQL is the system of record.	Confirm managed/local deployment option, backups and connection security.
Secrets	Keep secrets outside the repository.	Configure deployment secret storage and rotation.
Networking	Frontend calls the backend through a controlled API boundary.	Confirm CORS, HTTPS and allowed origins.
Database state	Application state is kept in PostgreSQL rather than local files.	Confirm backup and recovery process before deployment.

The deployment decision is therefore intentionally left open at the provider level. Choosing a hosting service too early would add a dependency before the team knows the final deployment requirements. The stack itself is portable enough to support a later decision.
8. Technology and Operational Risks
ID	Risk	Probability	Impact	Mitigation / response	Owner
RSK-006	Dependency incompatibility between frontend, backend and runtime versions.	Medium	Medium	Keep versions recorded, use lockfiles, review dependency changes and test after upgrades.	Mzingeli
RSK-007	A developer has a different local environment and cannot reproduce the application setup.	Medium	Medium	Document versions, provide .env.example, standardise commands and keep setup instructions in README.	Mzingeli
RSK-008	Secrets are accidentally committed during application development.	Low	High	Use .gitignore, synthetic data, PR review and a repository check before merge. Rotate any exposed credential immediately.	Team
RSK-009	Database changes break the application or leave environments inconsistent.	Medium	High	Use versioned migrations, review schema changes through PRs and test migrations against a clean database.	Mzingeli / Person 2
RSK-010	Deployment platform does not support the selected runtime or database setup.	Low	Medium	Confirm compatibility before deployment and keep provider-specific configuration separate from application code.	Team

These risks extend the M1 register rather than replacing it. They become more relevant now because the project has moved from requirements into construction. The team should update their status as actual repository and deployment evidence becomes available.
