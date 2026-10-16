import type { Role, ServiceRequest, Status } from "../types";

/**
 * UI mirror of the backend lifecycle table in src/domain/fsm/states.js (FR-006, ADR-DES-001).
 * The backend is the authority: this copy only decides which controls to show.
 * tests/fsm.parity.test.ts fails if the two tables ever drift apart (risk R-ARCH-02).
 */
const STAFF: Role[] = ["Staff", "Supervisor", "Admin"];
const SUP: Role[] = ["Supervisor", "Admin"];
export interface Rule { to: Status; roles: Role[] }

export const TRANSITIONS: Record<Status, Rule[]> = {
  Submitted: [{ to: "Assigned", roles: STAFF }, { to: "Rejected", roles: STAFF }],
  Assigned: [{ to: "In_Progress", roles: STAFF }, { to: "Assigned", roles: SUP }, { to: "Rejected", roles: STAFF }],
  In_Progress: [{ to: "Resolved", roles: STAFF }, { to: "Assigned", roles: SUP }],
  Resolved: [{ to: "Closed", roles: SUP }, { to: "In_Progress", roles: STAFF }],
  Closed: [], Rejected: [],
};
export const MIN_RESOLUTION_NOTE = 20;
export const MIN_REJECTION_REASON = 15;

export const isFinal = (s: Status) => s === "Closed" || s === "Rejected";
export const isOverdue = (r: ServiceRequest) => !["Resolved", "Closed", "Rejected"].includes(r.status) && new Date(r.slaDueAt) < new Date();
export const label = (s: Status) => s.replace("_", " ");

/** Every target this role may move the request to (includes Assigned for assign/reassign). */
export const allowedNext = (from: Status, role: Role): Status[] => TRANSITIONS[from].filter(r => r.roles.includes(role)).map(r => r.to);
/** Status choices for the dropdown: assignment is done through the Assign control, not the dropdown. */
export const statusChoices = (from: Status, role: Role) => allowedNext(from, role).filter(s => s !== "Assigned");
export const canAssign = (from: Status, role: Role) => allowedNext(from, role).includes("Assigned");

/** Returns ALL violated preconditions at once (same messages as the backend guards). */
export function guards(to: Status, note: string, hasAssignee: boolean): string[] {
  const n = note.trim();
  if (to === "Assigned" && !hasAssignee) return ["An assigned staff member is required."];
  if (to === "Resolved") return n.length === 0 ? ["Resolution notes are required before a request can be resolved."]
    : n.length < MIN_RESOLUTION_NOTE ? [`Resolution notes must be at least ${MIN_RESOLUTION_NOTE} characters.`] : [];
  if (to === "Rejected") return n.length === 0 ? ["A rejection reason is required before a request can be rejected."]
    : n.length < MIN_REJECTION_REASON ? [`A rejection reason must be at least ${MIN_REJECTION_REASON} characters.`] : [];
  return [];
}
