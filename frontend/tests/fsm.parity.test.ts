// Basis: FR-006 / ADR-DES-001 / risk R-ARCH-02 (lifecycle rules duplicated across components).
// Technique: model-based comparison - the UI table must equal the backend authority src/domain/fsm/states.js.
import { describe, expect, it } from "vitest";
import backend from "../../src/domain/fsm/states.js";
import { MIN_REJECTION_REASON, MIN_RESOLUTION_NOTE, TRANSITIONS, allowedNext } from "../src/services/fsm";
import { STATUSES, type Role } from "../src/types";

const ROLES = Object.values(backend.ROLES) as Role[];

describe("FE-UT-01 UI lifecycle mirrors backend FSM (FR-006)", () => {
  it("knows exactly the backend states", () => {
    expect([...STATUSES].sort()).toEqual(Object.values(backend.STATES).sort());
    expect(Object.keys(TRANSITIONS).sort()).toEqual(Object.values(backend.STATES).sort());
  });
  it("offers each role exactly the targets the backend permits, for every state", () => {
    for (const state of Object.values(backend.STATES) as string[]) for (const role of ROLES) {
      const expected = backend.TRANSITIONS[state].filter((r: { allowedRoles: string[] }) => r.allowedRoles.includes(role)).map((r: { to: string }) => r.to).sort();
      expect(allowedNext(state as never, role).sort(), `${state} as ${role}`).toEqual(expected);
    }
  });
  it("uses the same note-length thresholds as the database CHECK constraints", () => {
    expect(MIN_RESOLUTION_NOTE).toBe(backend.MIN_RESOLUTION_NOTE_LENGTH);
    expect(MIN_REJECTION_REASON).toBe(backend.MIN_REJECTION_REASON_LENGTH);
  });
});
