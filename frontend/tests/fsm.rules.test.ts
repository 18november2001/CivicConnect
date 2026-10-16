// Basis: FR-006 acceptance criteria (guards, role-restricted closure, terminal states). Technique: BVA + decision table (role x state).
import { describe, expect, it } from "vitest";
import { canAssign, guards, statusChoices } from "../src/services/fsm";

describe("FE-BB-02 guards: boundary values on notes (FR-006)", () => {
  it.each([[19, 1], [20, 0]])("Resolved with %i-char note -> %i violation(s)", (len, n) => expect(guards("Resolved", "x".repeat(len), true)).toHaveLength(n));
  it.each([[14, 1], [15, 0]])("Rejected with %i-char reason -> %i violation(s)", (len, n) => expect(guards("Rejected", "x".repeat(len), true)).toHaveLength(n));
  it("whitespace-only note counts as empty", () => expect(guards("Resolved", " ".repeat(30), true)[0]).toMatch(/required/));
  it("Assigned needs an assignee", () => expect(guards("Assigned", "", false)).toHaveLength(1));
});

describe("FE-BB-03 role x state decision table (FR-006, NFR-001)", () => {
  it("Staff cannot close; Supervisor and Admin can", () => {
    expect(statusChoices("Resolved", "Staff")).not.toContain("Closed");
    expect(statusChoices("Resolved", "Supervisor")).toContain("Closed");
    expect(statusChoices("Resolved", "Admin")).toContain("Closed");
  });
  it("Citizen has no controls in any state (negative / unauthorised)", () => {
    for (const s of ["Submitted", "Assigned", "In_Progress", "Resolved"] as const) { expect(statusChoices(s, "Citizen")).toEqual([]); expect(canAssign(s, "Citizen")).toBe(false); }
  });
  it("terminal states offer nothing to anyone", () => {
    for (const role of ["Staff", "Supervisor", "Admin"] as const) for (const s of ["Closed", "Rejected"] as const) expect(statusChoices(s, role)).toEqual([]);
  });
  it("only Supervisor/Admin may reassign an already-assigned request", () => {
    expect(canAssign("Assigned", "Staff")).toBe(false);
    expect(canAssign("Assigned", "Supervisor")).toBe(true);
    expect(canAssign("Submitted", "Staff")).toBe(true);
  });
});
