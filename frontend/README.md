# CivicConnect Frontend (React + Vite + TypeScript)

    cd frontend
    npm install
    npm run dev        # http://localhost:5173  (mock data by default)
    npm test           # vitest: 38 tests; npm run coverage for the services layer
    npm run lint       # type-check
    npm run build

**Mock vs live:** copy `env.example` to `.env.local` and set `VITE_API_MODE=live` to talk to the Express API (proxied from `/api` to
`VITE_PROXY_TARGET`). Contract: `../docs/api/frontend-api-contract.md`. Mock logins (password `password`): `citizen@demo.test`,
`staff@demo.test`, `super@demo.test`. Staff sign-up in mock mode uses the code `STAFF-DEMO`.
With the real back end, run `npm run seed:demo` in the repo root to create the same demo accounts.

Structure: `src/pages` (screens W1–W7), `src/components`, `src/services` (`fsm.ts` UI mirror of the backend lifecycle,
`validation.ts` mirror of DB CHECK limits, `api.live.ts` / `api.mock.ts` behind `api.ts`), `src/types`, `tests`.
`tests/fsm.parity.test.ts` imports `../src/domain/fsm/states.js` and fails if the UI lifecycle ever differs from the backend.
