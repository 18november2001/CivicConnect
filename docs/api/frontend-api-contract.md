# Front end ↔ back end API contract

Base path `/api/v1`. JSON in and out. Authenticated calls send `Authorization: Bearer <jwt>` (the token comes from login or sign-up and lasts 8 hours).

Errors always look like `{ "error": { "code": "...", "message": "...", "violations": ["..."] } }` (`violations` only on 400/422). The front end (`frontend/src/services/http.ts`) depends on this shape.

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `POST /auth/login` | anyone | `{ email, password }` | `200 { token, user }` |
| `POST /auth/register` | anyone | `{ fullName, email, password }` | `201 { token, user }` – always role **Citizen** |
| `POST /auth/register-staff` | anyone with the code | `{ fullName, email, password, department, staffCode }` | `201 { token, user }` – always role **Staff** |
| `POST /requests` | Citizen | `{ title, category, description, locationAddress, suburb }` | `201 ServiceRequest` |
| `GET /requester/requests?page&pageSize` | signed-in user | – | `200 { total, items }` (own requests) |
| `GET /requests/:id` | owner, or any staff role | – | `200 ServiceRequest` + `timeline`; staff also get `audit` |
| `GET /requests?q&status&category&suburb&assignee&from&to&sort` | Staff, Supervisor, Admin | `status` may be `Overdue`; `assignee` may be `none`; `sort` = `createdAt｜slaDueAt｜status` | `200 { items }` (max 200) |
| `GET /requests/suburbs` | staff roles | – | `200 string[]` |
| `GET /users?role=staff` | staff roles | – | `200 User[]` (Staff + Supervisor) |
| `PATCH /requests/:id/assign` | staff roles | `{ staffId, handoverNotes, expectedUpdatedAt }` | `200 ServiceRequest` |
| `PATCH /requests/:id/status` | staff roles | `{ targetStatus, notes, expectedUpdatedAt }` | `200 ServiceRequest` |
| `GET /reports/summary` | Supervisor, Admin | – | `200 Stats` |
| `GET /reports/export?format=csv｜json&status&category` | Supervisor, Admin | – | file download |

Status codes: `400` validation, `401` missing/expired token (`UNAUTHENTICATED`) or bad login (`INVALID_CREDENTIALS`), `403` wrong role / bad staff code, `404` not found (also used when a citizen asks for someone else's request), `409` stale `expectedUpdatedAt` (`CONCURRENT_MODIFICATION`) or email already registered (`EMAIL_TAKEN`), `422` illegal lifecycle move (`ILLEGAL_TRANSITION`, every failed rule in `violations`).

`status` notes: `Resolved` needs `notes` ≥ 20 characters, `Rejected` ≥ 15. Use `/assign` (not `/status`) to assign or reassign.

Shapes (`user`, `ServiceRequest`, `Stats`) are defined in `frontend/src/types/index.ts`; the database-to-JSON mapping is `src/presentation/mappers.js`.
