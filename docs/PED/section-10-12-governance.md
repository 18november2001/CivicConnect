10. GitHub Governance & Configuration Management

The team repository is part of the project's engineering control environment rather than a file-storage service. All controlled CivicConnect artefacts — the PED, the Requirements Traceability Matrix, the Risk Register, the Engineering Decision Log, the Forward Engineering Considerations register, the AI Usage Register and the Team Working Agreement — are held in the repository and change only through the controlled workflow described below. These controls were established at the start of Milestone 1, before application development began, because a baseline assembled without control cannot afterwards be shown to have been controlled.

10.1 Repository structure

The repository is organised so that controlled engineering artefacts are separated from application code, following the structure suggested in Appendix C of the Master Project Brief. Controlled documentation is held under a documentation directory, with the PED, requirements and traceability, decisions, risk, change and governance artefacts each in their own subdirectory. Application code and tests have reserved locations and are intentionally unpopulated at Milestone 1, since construction begins in a later milestone.

A Pull Request template requires every Pull Request to state the linked issue or requirement identifier, the nature of the change, and what the author asks reviewers to check. A .gitignore is configured to prevent environment files, local configuration and build output from entering the repository.

10.2 Mandatory controls applied to the main branch

The following controls implement the GitHub Governance and Configuration Management Standard defined in the Master Project Brief. The project is maintained in a single controlled team repository at https://github.com/18november2001/CivicConnect.

Control	Requirement	How the team applied it
Repository	One controlled team repository	A single controlled repository is maintained for the project
Main branch	Protected, treated as the controlled product state	A branch ruleset is applied to the main branch
Direct development on main	Not permitted for substantive controlled changes	A Pull Request is required before merge; direct pushes are blocked
Pull Requests	Required for substantive changes entering main	Enforced by repository configuration rather than by agreement
Approval	Minimum of two approvals from members other than the author	Required approving reviews set to two
Self-approval	Not accepted	Not counted by the platform, and the bypass restriction prevents circumvention
Review quality	Approval must reflect meaningful review	Review standard defined in 10.3
Issues and tasks	Meaningful engineering work represented in the backlog and linked where practical	One issue per substantive artefact, linked to its Pull Request
Secrets	Passwords, API keys, tokens, private keys and credentials must not be committed	A .gitignore is configured, no credentials appear in repository history, and configuration is held outside the repository
History	Commits, Pull Requests, reviews, merges and changes must be progressive and authentic	Artefacts were committed from the start of Milestone 1 and updated as work proceeded

Supporting settings applied to the ruleset:

Setting	Value	Engineering rationale
Dismiss stale approvals on new commits	Enabled	Prevents an approval of one version of a change from carrying across to a materially different version
Conversation resolution required	Enabled	Ensures review concerns are answered rather than merged past
Force pushes blocked	Enabled	Protects the authenticity of repository history, which is itself controlled evidence
Branch deletion restricted	Enabled	The main branch cannot be removed or recreated in a way that would conceal history
Administrator bypass not permitted	Enabled	Applies the rules to every member, including the member who configured them. Without this setting the control is advisory rather than enforced.
Status checks required	Not enabled at Milestone 1	Continuous Integration implementation falls outside the Milestone 1 boundary. Recorded as DEC-004 in the Engineering Decision Log as a deliberate deferment; the setting is enabled when automated build and test are introduced at Milestone 3.

The configuration is demonstrable live in the repository settings.

The team applies the following branch and commit conventions so that history remains readable and traceable:

Convention	Format	Example
Branch naming	Change type, issue number, short description	docs/14-stakeholder-analysis
Commit message	Imperative, scoped, referencing the issue	Add influence and interest analysis for STK-03 (#14)
10.3 Meaningful review

Every substantive change to a controlled artefact enters the main branch through a Pull Request approved by two team members other than the author. Approval is treated as an engineering statement rather than a courtesy, and the team applies the review evidence path defined in the Master Project Brief: a review comment leads to an author response, a correction, a re-review, approval and finally a controlled merge.

Reviewers evaluate, as relevant to the change, alignment with requirements and acceptance criteria, correctness and design consistency, maintainability and technical debt, security and privacy implications, tests and regression implications, dependency changes, documentation and traceability impact, and whether the change should be accepted into the controlled baseline. At Milestone 1 the changes under review are engineering artefacts rather than code, so the criteria that apply most often are alignment with requirements, traceability impact and whether the change belongs in the baseline. The remaining criteria become active as construction begins in later milestones.

The team defined what counts as a substantive change so that the boundary is not decided case by case:

Change type	Route
New or revised requirement, risk, decision, constraint or scope item	Pull Request, two approvals
New PED section, or a rewrite that changes meaning	Pull Request, two approvals
Typographical or formatting correction with no change of meaning	Pull Request, two approvals; review is expected to be brief, but the control is not waived

Two approvals rather than one were required for four reasons. A single reviewer is a single point of failure who may miss an error or approve without engaging, whereas a second independent reviewer materially reduces both risks. CivicConnect artefacts are interdependent, so a requirement change affects the Requirements Traceability Matrix, may raise a risk and may contradict a scope boundary, and the author is the person least likely to notice the effect on artefacts they did not write. The Master Project Brief requires every member to understand the complete project rather than only their own tasks, and mandatory review is the mechanism that distributes that understanding across the team. Finally, each merge carries two named engineers who examined the change, which is what makes the baseline defensible rather than merely agreed.

The team recognises a cost in this model. With three members, every Pull Request requires both non-authors, so one member's unavailability blocks all merges. This is recorded as RSK-007 in the Risk Register, mitigated by an agreed review turnaround of twenty-four hours and a working rule that outstanding reviews are completed before new drafting begins. The team accepted the availability cost rather than weakening the control, because a control relaxed under schedule pressure provides no assurance at the point where it matters most.

10.4 Team Working Agreement

The Team Working Agreement is held under version control in the governance directory of the repository and was agreed by all members at the start of Milestone 1.

Area	Agreement
Review turnaround	Reviews are completed within twenty-four hours of a Pull Request being opened
Commit cadence	Each member commits progressively as work is done; bulk uploads are not acceptable evidence
Definition of done	Drafted, checked against the milestone brief, Pull Request raised, two approvals obtained, merged
Disagreement in review	Discussed in the Pull Request thread; unresolved items are raised at the team meeting and recorded in the Engineering Decision Log
Meetings	Twice weekly, on Monday and Thursday, with actions recorded as repository issues
Escalation	Non-response beyond twenty-four hours is raised with the team, and thereafter with the lecturer
Internal freeze	All content is merged three days before the milestone presentation date, leaving that period for assembly, whole-document review and sign-off
Secrets handling	No credentials, tokens or keys are placed in the repository, in issues, or in prompts to external AI systems
Presentation	Every member participates in the milestone presentation and individual engineering defence, regardless of how contribution was divided
10.5 Individual contribution evidence

The Master Project Brief specifies minimum individual evidence for each student. The following is available live in the repository for every member and is offered as live evidence rather than as screenshots.

Required evidence	Where it is shown
Meaningful commits attributable to the student	Repository insights and commit history
Ownership of project issues or tasks	Issues filtered by assignee
Pull Requests authored by the student	Pull Requests filtered by author
Pull Requests meaningfully reviewed by the student	Pull Requests filtered by reviewer, and the associated review threads
Contribution to controlled documentation and decision records	File history on the relevant artefacts

In line with the PED Quality Standard, screenshots are retained only as a fallback where live access is unavailable, and are not presented in place of live artefacts.

11. AI Usage Register
11.1 Purpose and operating rules

The AI Usage Register records material AI contributions to CivicConnect artefacts and the human verification applied before that output entered a controlled artefact. AI output is not authoritative evidence and does not transfer accountability away from the student or the team. The statement that AI generated something is never an acceptable engineering defence.

The team operates the register under the following rules, derived from the Responsible AI Engineering Standard in the Master Project Brief.

Material AI contributions are recorded in the register, and entries are made before the associated Pull Request is merged rather than reconstructed afterwards. Important AI claims are verified against credible evidence or technical tests; asking the same or another AI tool to confirm its output does not constitute verification. Each member records their own entries, because verification is a personal engineering act and no member can attest that another member verified something. The document owner maintains the register's structure and completeness, while the content of each row belongs to its author.

No credentials, confidential material or inappropriate personal or sensitive data are exposed to external AI systems. For CivicConnect this includes any realistic service-request data containing personal information, since the system will hold reporter identities and request details.

AI-assisted content is subject to the same branch and review controls as human-authored work, and to build, test and security controls once construction begins. Reviewers check for a corresponding register entry whenever a Pull Request contains AI-assisted content. Every member must be able to explain, defend and modify any AI-assisted artefact they submit.

11.2 Register

The register uses the minimum fields required by the Master Project Brief and is maintained in the governance directory of the repository. Entries are added by each member as work is performed.

Date	Student	Tool	Engineering task	AI contribution	Verification	Decision	Issues found
							
12. Baseline, Change Control & Document Management
12.1 PED versioning

The PED is a single evolving engineering record rather than four unrelated reports. Major versions correspond to milestone baselines.

Version	Phase	Content baselined
v1.0	Milestone 1	Problem, stakeholders, scope, requirements, constraints, risk, process, governance, baseline
v2.0	Milestone 2	Architecture, design, technology, data, user interface, application programming interfaces, Architecture Decision Records, updated risk and traceability
v3.0	Milestone 3	Change impact, construction and integration evidence, Continuous Integration, testing, quality, security, release readiness
v4.0	Milestone 4	Final success evaluation, deployment evidence, stakeholder validation, decision consequences, technical debt and evolution

Authorised changes within a milestone are recorded as v1.1, v1.2 and so on. Baselined content is not silently overwritten: superseded content is preserved and every change is linked to an approved change record.

Every row of the version history corresponds to a merged Pull Request, so that the document's recorded history and the repository's history agree. Where the two diverge, the document control claim fails regardless of what the version history records.

Version	Date	Author	Summary of change	Reviewed by	Approved by
					
12.2 Change control after baseline

The distinction between a draft and a baseline is not completeness but controllability. A baselined document is one where further change requires impact analysis and authorisation rather than editing. From version 1.0 onward, change follows the process defined in the Master Project Brief: a change request leads to impact analysis, a decision, authorisation, implementation, verification, and finally an updated baseline.

Change requests are recorded in the change directory of the repository using the impact analysis template provided in the Master Project Brief. That template requires consideration of requirements and acceptance criteria, architecture and design, user interface, data and migration, interface contracts, security and privacy, scope, schedule, cost and resources, testing and regression, deployment and operations, and risk and technical debt. Approved changes update the Requirements Traceability Matrix and every other affected artefact.

12.3 Team review record

The assembled PED is reviewed by the team as a whole document, separately from the section-level review carried out through Pull Requests. Whole-document review addresses coherence problems that appear only once sections sit together, such as inconsistent terminology, duplicated content, identifiers that do not match the Requirements Traceability Matrix, and references to artefacts that no longer exist.

Reviewer	Date	Issue raised	Resolution	Evidence
				

The following coherence checks are applied during assembly. Every requirement identifier in the PED appears in the Requirements Traceability Matrix, and every matrix entry corresponds to a requirement in the PED. Identifier schemes are consistent across requirements, risks and decisions. Every risk has a cause, an owner and a current status. Terminology is consistent across sections, including the naming of the requester, staff and management user groups. Every stakeholder in the analysis is referenced by at least one derived requirement, or is explicitly noted as having none. No section contradicts another on scope boundaries. No quality, security or readiness claim appears without supporting evidence or an acknowledged limitation. No AI-assisted content appears without a corresponding entry in the AI Usage Register.

12.4 Baseline readiness

The team completes the following internal readiness check before sign-off.

#	Criterion	Status	Evidence
1	PED v1.0 is complete, coherent, versioned and reviewed as a whole document		
2	Scope and requirements are baselined rather than drafted		
3	The Requirements Traceability Matrix is current and identifiers are stable		
4	The Risk Register is current, with a cause, owner and status for every entry		
5	The Engineering Decision Log records genuine Milestone 1 decisions and justified deferments		
6	The Forward Engineering Considerations register is current		
7	The AI Usage Register is current, with verification recorded		
8	Branch protection and two-reviewer approval are demonstrably enforced		
9	No secrets are present in repository history		
10	The Team Working Agreement is agreed and under version control		
11	Repository history shows authentic progressive contribution by every member		
12	Every member meets the minimum individual evidence requirements		
13	Every member can trace at least one requirement and explain at least one engineering decision		
12.5 Baseline sign-off

The baseline is signed off using the template provided in the Master Project Brief.

Field	Entry
Project	CivicConnect
Baseline type	Engineering Foundation and Requirements Baseline
Version	v1.0
Date	
Scope reviewed	YES / NO
Requirements and traceability checked	YES / NO
Risk review completed	YES / NO
Repository and governance controls checked	YES / NO
Outcome	ACCEPTED / CONDITIONALLY ACCEPTED / REVISION REQUIRED
Conditions, if any	
Signed	
The gate outcome is recorded separately from the assessed mark. Where the team identifies known gaps in the foundation, a conditionally accepted outcome with stated conditions is recorded rather than an unqualified acceptance, in line with the Master Project Brief's position that professional honesty about limitations and residual risk is valued above unsupported claims of completeness.

The gate outcome is recorded separately from the assessed mark. Where the team identifies known gaps in the foundation, a conditionally accepted outcome with stated conditions is recorded rather than an unqualified acceptance, in line with the Master Project Brief's position that professional honesty about limitations and residual risk is valued above unsupported claims of completene
