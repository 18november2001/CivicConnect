// Basis: API contract docs/api/frontend-api-contract.md; NFR-001 (auth), FR-006 (error mapping). Level: API/integration at the client boundary,
// run against a local stub HTTP server so the live client is exercised without the real backend.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let server: Server, seen: { url?: string; method?: string; auth?: string; body?: unknown }[] = [];
const readBody = (req: IncomingMessage) => new Promise<string>(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => r(d)); });
const send = (res: import("node:http").ServerResponse, code: number, json: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req); seen.push({ url: req.url, method: req.method, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
    if (req.url === "/api/v1/auth/login") return send(res, 200, { token: "tok-123", user: { id: "u1", name: "T", email: "t@x", role: "Citizen" } });
    if (req.url?.endsWith("/status") && raw.includes("Closed")) return send(res, 422, { error: { code: "ILLEGAL_TRANSITION", message: "Transition not permitted", violations: ["Staff may not close.", "Second violation."] } });
    if (req.url?.endsWith("/status") && raw.includes("Stale")) return send(res, 409, { error: { code: "CONCURRENT_MODIFICATION", message: "x" } });
    if (req.url?.startsWith("/api/v1/requests/expired")) return send(res, 401, { error: { code: "UNAUTHENTICATED", message: "expired" } });
    if (req.url?.startsWith("/api/v1/requests/missing")) return send(res, 404, { error: { code: "REQUEST_NOT_FOUND", message: "nf" } });
    if (req.url === "/api/v1/requester/requests?page=2&pageSize=25") return send(res, 200, { total: 1, items: [] });
    send(res, 200, { id: "r1", status: "Assigned", updatedAt: "2026-10-01T10:00:00Z" });
  }).listen(0);
  vi.stubEnv("VITE_API_BASE", `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`);
});
afterAll(() => { server.close(); vi.unstubAllEnvs(); });

describe("FE-IT-01 live API client honours the contract", () => {
  it("stores the token on login and sends it as a Bearer header afterwards", async () => {
    const { liveApi } = await import("../src/services/api.live"); const { session } = await import("../src/services/http");
    const user = await liveApi.login("t@x", "pw");
    expect(user.role).toBe("Citizen"); expect(session.token()).toBe("tok-123");
    await liveApi.myRequests(user, 2, 25);
    expect(seen.at(-1)).toMatchObject({ url: "/api/v1/requester/requests?page=2&pageSize=25", auth: "Bearer tok-123" });
  });
  it("sends expectedUpdatedAt and the target status on transition (optimistic concurrency)", async () => {
    const { liveApi } = await import("../src/services/api.live");
    const res = await liveApi.transition({} as never, "r1", "In_Progress", "n", "2026-10-01T10:00:00Z");
    expect(res.ok).toBe(true);
    expect(seen.at(-1)).toMatchObject({ method: "PATCH", url: "/api/v1/requests/r1/status", body: { targetStatus: "In_Progress", expectedUpdatedAt: "2026-10-01T10:00:00Z" } });
  });
  it("maps ILLEGAL_TRANSITION (422) to ALL violations (negative)", async () => {
    const { liveApi } = await import("../src/services/api.live");
    const res = await liveApi.transition({} as never, "r1", "Closed", "", "t");
    expect(res).toEqual({ ok: false, errors: ["Staff may not close.", "Second violation."] });
  });
  it("maps CONCURRENT_MODIFICATION (409) to a reload message", async () => {
    const { liveApi } = await import("../src/services/api.live");
    const res = await liveApi.transition({} as never, "r1", "In_Progress", "Stale", "t");
    expect(!res.ok && res.errors[0]).toMatch(/Reload/);
  });
  it("returns null for a 404 (not found is not an error screen)", async () => {
    const { liveApi } = await import("../src/services/api.live");
    expect(await liveApi.getRequest("missing-id")).toBeNull();
  });
  it("clears the session and signals logout on a 401 (unauthenticated)", async () => {
    const { liveApi } = await import("../src/services/api.live"); const { session } = await import("../src/services/http");
    const fired = vi.fn(); vi.stubGlobal("window", { dispatchEvent: fired });
    await expect(liveApi.getRequest("expired-id")).rejects.toMatchObject({ status: 401 });
    expect(session.token()).toBeNull(); expect(fired).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
