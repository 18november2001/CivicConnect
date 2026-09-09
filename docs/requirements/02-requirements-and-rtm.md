1. Requirements Formulation & Traceability Method
This section builds directly on the Problem Statement, Business Value, Stakeholder Analysis (STK-01 to STK-05), and Scope Baseline defined in Section 1. 
In software engineering, requirements are not just a list of features or wishes. They act as a binding contract that guides how we design the architecture in Milestone 2 and how we verify the code in Milestone 3: 
	Functional Requirements (FRs): Focus on specific user tasks and system behavior, structured around a strict Finite-State Machine (FSM) so tickets cannot jump into invalid states. Every FR has clear acceptance criteria with exact inputs, outputs, and boundary conditions. 
	Non-Functional Requirements (NFRs): Define quality standards such as security, performance, data integrity, and maintainability. We have avoided vague words like "fast", "intuitive", or "secure", using measurable thresholds and direct architectural constraints instead. 
	Requirements Traceability Matrix (RTM): Keeps an unbroken link from each stakeholder need through its requirement, acceptance test, downstream design placeholder, and test case. 

2. Service Request Lifecycle State Machine 
 

3. Functional Requirements (FR) Baseline
Prioritized using the MoSCoW framework based on our agreed project scope.
FR-001: Structured Request Submission
	Priority: Must Have
	Source: STK-01; Section 5.2 (In-Scope: Requesters). Directly addresses issues with missing data from WhatsApp/calls (Section 1.1).
	Description: The system must provide an authenticated web form for citizens to log service requests with controlled categories and location details.
	Input Specifications:
	Title: Text string (5 to 100 characters).
	Category: Selection from dropdown (Roads, Water, Electricity, Refuse, Sanitation).
	Description: Detailed text (20 to 2,000 characters).
	Location: Street address and suburb (10 to 255 characters).
	Acceptance Criteria:
	The form blocks submission and displays inline validation errors if any required field is empty or out of character bounds.
	On valid submission, the system generates a unique tracking reference code (REQ-YYYYMMDD-XXXX).
	The request is saved to the database with the initial status set to Submitted, storing the requester’s ID and creation timestamp in UTC.
	The platform returns a success response with the tracking ID in ≤1.5seconds.

FR-002: Requester Tracking & History View
	Priority: Must Have
	Source: STK-01; Section 4.1, Section 5.2 (In-Scope: Requesters). Stops requesters needing to call staff for updates (Section 2.2).
	Description: The system must provide logged-in requesters with a personal dashboard where they can see their current and past requests.
	Acceptance Criteria:
	Requesters can only see requests linked to their own account (requester_id == session.user_id). Attempting to view another user's request returns an access denied error (HTTP 403).
	The dashboard shows requests in a paginated list (10, 25, or 50 per page), sorted newest first.
	Each record shows tracking ID, category, submission date, current status, and public resolution feedback.
	Internal staff notes, worker names, and private logs are strictly hidden from this view.

FR-003: Public Feedback & Lifecycle Timeline
	Priority: Should Have
	Source: STK-01; Section 1.3 (Business Value: Requesters).
	Description: The system must maintain a visible history of status changes and official feedback for the citizen to follow.
	Acceptance Criteria:
	Whenever a request's status changes or a staff member posts an update, an entry is added to the public timeline within 1 second.
	The entry displays the event date/time, the update details, and the department responsible.
	Historical timeline entries cannot be changed or removed once saved.

FR-004: Staff Queue Querying, Sorting & Multi-Criteria Filtering
	Priority: Must Have
	Source: STK-02; Section 2.3, Section 5.2 (In-Scope: Staff). Solves staff having to manually search through spreadsheets (Section 1.1).
	Description: The system must provide staff with a dashboard to search, filter, and sort active and historical requests.
	Acceptance Criteria:
	Staff can filter simultaneously by: Status (Submitted, Assigned, In-Progress, Overdue, Resolved, Closed), Category, Suburb, Date Range, and Assigned Worker.
	The filter returns results within ≤1.5seconds when querying a dataset of up to 10,000 records.
	Staff can sort the table by creation date, deadline/SLA, and status.

FR-005: Operational Assignment & Responsibility Claiming
	Priority: Must Have
	Source: STK-02, STK-04; Section 1.3, Section 5.2 (In-Scope: Staff). Addresses lack of accountability for open requests (Section 1.1).
	Description: The system must allow staff to claim open requests or assign them to specific team members.
	Acceptance Criteria:
	A Submitted request cannot move to Assigned without an active staff member ID selected.
	Staff can claim unassigned requests that belong to their department.
	Every assignment change records who assigned it, who it was assigned to, the timestamp, and a handover note in the audit log.
	Staff cannot assign requests across different departments without supervisor permissions.

FR-006: Controlled Lifecycle Finite-State Machine (FSM)
	Priority: Must Have
	Source: STK-02, STK-04; Section 5.2, Section 9 (Scope Control).
	Description: The system must enforce a strict state machine for all request transitions to prevent tickets jumping states incorrectly.
	Permitted Transitions:
	Submitted →Assigned OR Rejected
	Assigned →In-Progress OR Submitted (Unassigned) OR Rejected
	In-Progress →Resolved OR Assigned (Reassigned)
	Resolved →Closed OR In-Progress (Reopened)
	Rejected →Terminal State
	Closed →Terminal State
	Acceptance Criteria:
	Any attempt to make an illegal transition (e.g., Submitted directly to Closed) is rejected with an error (HTTP 422).
	Marking a request as Resolved requires a mandatory note of at least 20 characters explaining what work was completed.
	Marking a request as Rejected requires a reason code and an explanation of at least 15 characters.
	Only users with the Supervisor or Admin role can perform the final Closed sign-off.

FR-007: Management SLA & Performance Oversight Dashboard
	Priority: Must Have
	Source: STK-03; Section 2.4, Section 4.3, Section 5.2 (In-Scope: Management). Gives management reliable figures without manual paperwork (Section 1.2).
	Description: The system must give management an overview dashboard of active, overdue, and completed requests by department.
	Acceptance Criteria:
	The dashboard displays real-time counts for: Open, Assigned, In-Progress, Overdue, and Closed requests.
	A request is automatically marked Overdue when:
"Elapsed Time"=T_"current" -T_"submission" >"SLA Target" 
and the request is not yet resolved, closed, or rejected.
	Dashboard numbers must match the actual database counts with 100% accuracy.
	Dashboard initial load and refresh times complete within ≤2.0seconds.

FR-008: Management Activity & Compliance Data Export
	Priority: Should Have
	Source: STK-03, STK-04; Section 1.3, Section 5.2 (In-Scope: Management).
	Description: The system must allow management to export filtered data into structured files for council reporting and audits.
	Acceptance Criteria:
	Users can export filtered reports into standard CSV and JSON formats.
	An export of up to 5,000 records completes within ≤5seconds.
	Export files include tracking IDs, categories, dates, turnaround hours, and final statuses, but citizen passwords and private identifiers are stripped out.

4. Non-Functional Requirements (NFR) Baseline
These quality attributes define performance, security, and integrity boundaries, and directly determine our Milestone 2 architectural choices.
NFR ID	Quality Attribute	Source & Engineering Rationale	Measurable Acceptance Target	M2 Architectural Constraint
NFR-001	Security & Access Control	STK-01, STK-02; PED Section 4.1. Ensures requesters only see their own tickets and staff access is properly restricted.	1. 100% of protected endpoints require valid authentication tokens. 


2. Horizontal privilege checks block User A from opening User B's tickets with HTTP 403 Forbidden. 


3. Passwords must be hashed using bcrypt (cost ≥12) or Argon2id; cleartext credentials never touch logs. 
	Requires a central Auth & Role-Based Access Control (RBAC) middleware pipeline to intercept requests before controllers. 
NFR-002	Data Integrity & Traceability	STK-04; PED Section 1.3, Section 2.5. Prevents records being edited off-the-record and ensures accountability. 	
1. 100% of status changes, assignments, and notes write a record to an immutable audit table. 


2. Audit records cannot be modified or deleted (UPDATE and DELETE SQL permissions revoked on audit tables). 


3. Cross-checking lifecycle changes against the audit table yields zero missing logs across 5,000 test transactions. 
	Prevents simple in-place overwriting of database rows. Requires an append-only audit log table or domain event store in M2.
NFR-003	Performance & Latency	STK-01, STK-02; PED Section 2.2, Section 2.3. Prevents queue lag and system freezes for municipal staff. 	1. 95% of read queries return in ≤1.5 seconds under 50 concurrent active users. 


2. 95% of state transition write requests complete in ≤800" ms" . 


3. Filtering 10,000 records by category, status, and date must execute with zero full table scans. 
	Dictates database index design: composite indexes must be defined on (status, category_id, created_at). 

NFR-004	Reliability & Error Handling	STK-04, STK-05; PED Section 1.2. Prevents server crashes and ensures sensitive system info is never leaked. 	1. Core services maintain ≥99.0% availability during standard operational hours. 


2. 100% of uncaught errors return clean, standardized RFC 7807 JSON error messages. 


3. Stack traces, DB connection strings, and environment variables are never returned in client payloads	Requires a global exception-handling middleware layer to catch errors and return sanitized client responses. 
NFR-005	Testability & Domain Isolation	STK-05; PED Section 2.6. Ensures business rules can be verified automatically in CI without live database dependencies.	1. Core domain logic (FSM, SLA calculations, validations) achieves ≥80% automated unit test coverage. 


2. 100% of unit tests run cleanly in-memory without requiring live network sockets or database connections. 


3. Automated test suite runs to completion in ≤45 seconds in the build pipeline. 
	Requires decoupled architecture (e.g., Layered or Hexagonal) so domain business rules remain isolated from UI and DB drivers. 
NFR-006	Maintainability & Code Standards	STK-05; PED Section 2.6. Keeps technical debt low and code readable across milestones. 	1. Static code analyzers report zero critical or high-severity rule violations. 


2. Cyclomatic complexity of core business logic routines remains ≤10. 


3. 100% of pull requests must pass linter and build checks before merging into protected branches. 
	Requires linter and static analysis configs (.editorconfig, .eslintrc) integrated into our GitHub build actions. 


5. Requirements Traceability Matrix (RTM) Baseline
The RTM connects our stakeholder needs to requirements and placeholders for Milestone 2 design components and Milestone 3 verification tests.
Trace ID	Stakeholder Need ID	Need Summary	Requirement ID	Scope Status	Verification Method	Downstream M2 Design Placeholder	Downstream M3 Test Placeholder
 
TR-01	STK-01	Standardized issue reporting & categories	FR-001	Baselined In-Scope	Automated Functional & Boundary Test	UI: RequestSubmissionForm
API: POST /api/v1/requests	TEST-FR001-VALIDATION
TEST-FR001-PERSISTENCE
TR-02	STK-01	Ticket progress and history visibility	FR-002	Baselined In-Scope	Automated Integration & RBAC Test	UI: RequesterHistoryView
API: GET /api/v1/requester/requests	TEST-FR002-AUTH-ISOLATION
TEST-FR002-PAGINATION
TR-03	STK-01	Visible feedback on operational actions	FR-003	Baselined In-Scope	Automated Integration Test	Component: RequestTimelineLog
Event: RequestUpdatedListener	TEST-FR003-TIMELINE-APPEND
TEST-FR003-REDACTION
TR-04	STK-02	Queue searching, filtering, and sorting	FR-004	Baselined In-Scope	Performance & Functional Test	UI: StaffWorkbenchQueue
Query: RequestSearchBuilder	TEST-FR004-SEARCH-FILTER
TEST-FR004-QUERY-PERF
TR-05	STK-02, STK-04	Accountability and clear task allocation	FR-005	Baselined In-Scope	Automated Functional Test	Service: AssignmentDispatcher
API: PATCH /api/v1/requests/{id}/assign	TEST-FR005-ASSIGN-STATE
TEST-FR005-AUTH-LOCK
TR-06	STK-02, STK-04	Controlled request lifecycle transitions	FR-006	Baselined In-Scope	Automated Unit Test (FSM Engine)	DomainModel: RequestStateMachine
FSM: FiniteStateTransitionEngine	TEST-FR006-VALID-TRANSITIONS
TEST-FR006-ILLEGAL-BYPASS
TR-07	STK-03	Visibility of open/overdue service metrics	FR-007	Baselined In-Scope	Data Integrity & SLA Calculation Test	UI: ManagementDashboard
Service: SLAComputationEngine	TEST-FR007-SLA-CALCULATION
TEST-FR007-METRIC-ACCURACY
TR-08	STK-03, STK-04	Structured audit data and metrics export	FR-008	Baselined In-Scope	Output File Inspection & Security Audit	ExportService: ReportExportEngine
API: GET /api/v1/reports/export	TEST-FR008-CSV-INTEGRITY
TEST-FR008-PII-SCRUBBING
TR-09	STK-01, STK-02	Access protection and privacy boundary	NFR-001	Baselined In-Scope	Automated Security Penetration Test	Middleware: TokenAuthentication
Policy: RoleAuthorizationGuard	TEST-NFR001-PRIVILEGE-ESCALATION
TEST-NFR001-HASH-VERIFY
TR-10	STK-04	Reliable process and tamper-resistant logs	NFR-002	Baselined In-Scope	Automated Database Integrity Test	DataStore: AppendOnlyAuditTable
Trigger: AuditRecordTrigger	TEST-NFR002-AUDIT-IMMUTABLE
TEST-NFR002-AUDIT-RECONCILE
TR-11	STK-01, STK-02	System responsiveness under working load	NFR-003	Baselined In-Scope	Automated Load Test (JMeter/k6)	DB: CompositeIndexDefinitions
Cache: QueryResultCache	TEST-NFR003-LATENCY-P95
TEST-NFR003-CONCURRENCY-50
TR-12	STK-04, STK-05	Robust operation with safe error reporting	NFR-004	Baselined In-Scope	Fault Injection Test	Middleware: GlobalExceptionHandler
Logging: StructuredJsonLogger	TEST-NFR004-FAULT-INJECTION
TEST-NFR004-ERROR-SANITIZE
TR-13	STK-05	Verifiable, decoupled business logic	NFR-005	Baselined In-Scope	CI Pipeline Automated Coverage Tool	Architecture: HexagonalCoreArchitecture
Interface: IRequestRepository	TEST-NFR005-COVERAGE-80
TEST-NFR005-MOCK-INDEPENDENCE
TR-14	STK-05	Enforce clean, maintainable code standards	NFR-006	Baselined In-Scope	Static Code Analyzer & Linter Gate	Config: .editorconfig
Linter: StaticAnalysisRuleset	TEST-NFR006-CYCLOMATIC-MAX10
TEST-NFR006-LINT-ZERO
TR-15	DEF-01	AI-Assisted Request Categorization	N/A	Baselined Deferred	Gate Review Against Decision Log	Deferral Entry: DEC-02 (Evaluation Gate)	N/A
TR-16	OOS-01	WhatsApp Ingestion Integration	N/A	Baselined Out-of-Scope	Scope Boundary Enforcement Review	Excluded from System Context Architecture	N/A



