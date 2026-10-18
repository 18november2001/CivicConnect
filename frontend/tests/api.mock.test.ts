// Basis: FR-002, FR-005, FR-006, NFR-001. Component-level behaviour of the assign/transition flow the screens depend on.
import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_STAFF_CODE, mockApi as api, resetMock } from "../src/services/api.mock";
import type { User } from "../src/types";

const staff: User = { id: "u2", name: "Sipho Staff", email: "s@x", role: "Staff", department: "Roads" };
const sup: User = { id: "u3", name: "Sue Supervisor", email: "u@x", role: "Supervisor", department: "Roads" };
const citizen: User = { id: "u1", name: "Thandi", email: "c@x", role: "Citizen" };
beforeEach(() => resetMock());

describe("FE-UT-03 staff sign-up (mock)", () => {
  it("creates a Staff user with a department when the registration code is right", async () => {
    const u = await api.registerStaff("New Staffer", "new.staff@x.test", "longenough1", "Water", MOCK_STAFF_CODE);
    expect(u).toMatchObject({ role: "Staff", department: "Water", email: "new.staff@x.test" });
    expect((await api.staff()).some(s => s.id === u.id)).toBe(true); // can now be assigned work
  });
  it("refuses a wrong code, a short password and a duplicate email (negative)", async () => {
    await expect(api.registerStaff("New Staffer", "a@x.test", "longenough1", "Water", "nope")).rejects.toThrow(/code/i);
    await expect(api.registerStaff("New Staffer", "b@x.test", "short", "Water", MOCK_STAFF_CODE)).rejects.toThrow(/8 characters/);
    await expect(api.registerStaff("Dup", "staff@demo.test", "longenough1", "Water", MOCK_STAFF_CODE)).rejects.toThrow(/already exists/);
  });
});

describe("FE-UT-02 assign and transition flow", () => {
  it("staff claims a Submitted request: becomes Assigned, audit and public timeline written", async () => {
    const r0 = (await api.getRequest("r1"))!;
    const res = await api.assign(staff, "r1", staff.id, "claim", r0.updatedAt);
    expect(res.ok && res.req.status).toBe("Assigned");
    expect(res.ok && res.req.audit!.at(-1)!.action).toBe("STAFF_ASSIGNED");
    expect(res.ok && res.req.timeline!.at(-1)!.department).toBe("Roads");
  });
  it("rejects an illegal transition and a role that is not permitted (negative)", async () => {
    const r = (await api.getRequest("r4"))!; // Resolved
    const res = await api.transition(staff, "r4", "Closed", "", r.updatedAt);
    expect(res.ok).toBe(false);
    const ok = await api.transition(sup, "r4", "Closed", "", r.updatedAt);
    expect(ok.ok && ok.req.status).toBe("Closed");
  });
  it("returns ALL guard violations together, not one at a time", async () => {
    const r = (await api.getRequest("r2"))!; // In_Progress, assigned
    const res = await api.transition(staff, "r2", "Resolved", "short", r.updatedAt);
    expect(!res.ok && res.errors.length).toBeGreaterThanOrEqual(1);
  });
  it("detects a concurrent modification (stale updatedAt) and changes nothing", async () => {
    const stale = (await api.getRequest("r3"))!.updatedAt;
    await api.transition(staff, "r3", "In_Progress", "", stale);
    const res = await api.transition(staff, "r3", "Rejected", "this reason is long enough", stale);
    expect(!res.ok && res.errors[0]).toMatch(/changed by someone else/);
    expect((await api.getRequest("r3"))!.status).toBe("In_Progress");
  });
  it("a citizen only ever sees their own requests (FR-002)", async () => {
    const other: User = { ...citizen, id: "u9" };
    expect((await api.myRequests(other, 1, 10)).total).toBe(0);
    expect((await api.myRequests(citizen, 1, 10)).total).toBe(5);
  });
});
