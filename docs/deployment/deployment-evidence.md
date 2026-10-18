# CivicConnect Deployment Evidence

**Owner:** Student 4 (system integration, deployment evidence, go-live decision)
**Status:** Milestone 4 working record. Finalised at the go-live point.

This document records what has been deployed, how it is verified, and what the
verification does and does not prove. It does not duplicate the Release
Evidence Summary; that document interprets quality evidence, this one records
deployment facts.

---

## 1. Release identification

The assessed product is one identified commit. Evidence in PED v4.0, the final
RTM and the registers all refer to this same baseline.

| Field | Value |
|---|---|
| Repository | `github.com/18november2001/CivicConnect` |
| Final release tag | *to be set at the go-live point* |
| Final commit hash | *to be set at the go-live point* |
| PED version | v4.0 Final |

A tag rather than a branch name, because a branch moves and a tag does not. An
assessor returning to the repository after submission must see the same code
the demonstration showed.

---

## 2. Environment model

| Environment | What it is | Data | Messaging |
|---|---|---|---|
| Development | Each developer's machine, Windows | Local PostgreSQL, synthetic data | Simulated adapter |
| Continuous integration | GitHub Actions, Ubuntu runner | PostgreSQL 16 service container, created and destroyed per run | Simulated adapter |
| Simulated production | Separated from development: own database, own configuration, release identified by tag | Synthetic data only, as required by DEC-002 | Simulated adapter |

No paid cloud service, container platform or managed database is used. The M4
brief states that such tooling is not a proxy for software engineering quality,
and the project's constraints recorded at M1 included no budget.

**Why synthetic data in every environment.** DEC-002 records that the team uses
synthetic data only, because service-request records are personal information
and the Security constraint prohibits real personal data in the repository or
in AI-assisted work. That decision applies to the deployed environment too.

---

## 3. Configuration and secrets

Configuration is supplied through environment variables and is never committed.

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Database connection for the application and the dispatch worker |
| `DATABASE_URL` | Alternative single-string form, used by the dispatch script |
| `JWT_SECRET` | Token signing key for the authentication endpoints |
| `PORT` | HTTP listener port |

**Controls in force.**

- `gitleaks` runs as a required status check on every pull request, scanning
  full history. A committed credential cannot be undone by deleting the file,
  so the check runs before the merge rather than at review time.
- The credentials visible in `.github/workflows/ci.yml` are for an ephemeral
  database that is created and destroyed with the runner. They reach nothing
  outside that job and are not project secrets.
- The application connects as a restricted database role, `civicconnect_app`,
  which has had UPDATE, DELETE and TRUNCATE revoked on the audit tables. That
  restriction is verified by TER-08 and its proportionality by TER-09.

**Known weakness.** `JWT_SECRET` falls back to a hard-coded development value
when the variable is absent. In a real production deployment that fallback must
be removed so the application refuses to start without a configured secret.
Recorded as technical debt rather than silently carried.

---

## 4. Deployment procedure

```
# 1. Check out the identified release
git checkout <final tag>

# 2. Install dependencies from the lock file
npm ci

# 3. Apply the schema in order to the target database
psql -v ON_ERROR_STOP=1 -f db/schema/001_core_schema.sql
psql -v ON_ERROR_STOP=1 -f db/schema/002_indexes_and_security.sql
psql -v ON_ERROR_STOP=1 -f db/schema/003_messaging_outbox.sql

# 4. Grant the restricted application role a password
psql -c "ALTER ROLE civicconnect_app LOGIN PASSWORD '<configured>';"

# 5. Start the service
npm start

# 6. Start the messaging dispatch worker
npm run dispatch:watch
```

`ON_ERROR_STOP=1` is not decoration. DEF-001 was a syntax error on the first
line of the schema that aborted the script silently, and no table was ever
created. Without that flag the same class of failure looks like success.

---

## 5. Post-deployment verification

Three checks, each producing evidence rather than a reassuring message.

### 5.1 Service health

```
curl http://<host>:<port>/health
```

Expected: HTTP 200 with `{"status":"UP","timestamp":"..."}`.

Proves the process is listening and the application module loaded. It does not
prove the database is reachable, which is why the next two checks exist.

### 5.2 Database and lifecycle

Run the end-to-end suite against the deployed database. It drives a complete
citizen journey over HTTP: submit, assign, start, resolve, read back, and
asserts an audit record for each transition.

```
npm run test:e2e
```

Expected: 5 passing. A skip means the HTTP layer is absent from the build.

### 5.3 Messaging boundary

```
npm run dispatch
```

Reports queue depth before and after, dispatches every pending message through
the configured adapter, and exits non-zero if any message fails. Example from a
verified run:

```
CivicConnect messaging dispatch: single run

Queue before:
  Pending      2
[simulated-messaging] WhatsApp to <recipient>: CivicConnect: your report
  REQ-DEMO-0001 has been assigned to the Water department. (SIM-00000001)
[simulated-messaging] SMS to <recipient>: CivicConnect: your report
  REQ-DEMO-0001 has been resolved. (SIM-00000002)

Examined   2
Dispatched 2
Failed     0

Queue after:
  Dispatched   2

Messaging boundary verified.
```

This check is the one that would have caught DEF-011. The dispatch worker was
written at Milestone 2 and never invoked by anything, so messages entered the
outbox and were never sent. A deployment that only checks `/health` would have
reported a healthy service with a permanently silent messaging boundary.

---

## 6. What the deployment evidence does not prove

- **No real messaging provider has ever been contacted.** Every environment
  uses the simulated adapter, as recorded in ADR-INT-001. The port and adapter
  separation means a real provider can be substituted without touching the
  lifecycle, but that substitution has not been performed or tested.
- **Recipient addressing is a stand-in.** The `users` table carries no phone
  column, so the dispatch resolver uses the e-mail address as the recipient.
  A real provider integration requires a verified phone number and the schema
  change to carry it.
- **No load has been applied to a deployed instance.** The performance exercise
  in TER-15 measures a single-user workload against a local database.
- **No backup, restore or disaster-recovery procedure exists.** M4 does not
  require one; it is stated here so that nobody infers one from the presence of
  a deployment procedure.
- **No monitoring or alerting.** A failed dispatch sets `last_error` on the
  outbox row and nothing watches that column.

---

## 7. Evidence locations

| Evidence | Location |
|---|---|
| Deployment procedure | This document, section 4 |
| Messaging dispatch verification | `npm run dispatch`, `scripts/dispatch-messages.js` |
| Messaging dispatch tests | `tests/integration/messagingDispatch.test.js`, MSG-01 to MSG-07 |
| End-to-end journey | `tests/e2e/requestLifecycleJourney.e2e.test.js`, TER-11 to TER-14 |
| Pipeline and gates | `.github/workflows/ci.yml`, four required checks |
| Secret scanning | gitleaks job, required status check |
| Database privilege control | `db/schema/002_indexes_and_security.sql`, TER-08 and TER-09 |
| Release decision | `docs/quality/go-live-decision.md` |
