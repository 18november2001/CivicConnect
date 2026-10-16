import type { RequestDraft } from "../types";

/** Limits mirror the CHECK / VARCHAR constraints on service_requests in migrations/Core_Schema.sql (FR-001). */
export const LIMITS = { title: [5, 100], description: [20, 2000], address: [10, 255], suburb: [1, 100] } as const;
const within = (s: string, [min, max]: readonly [number, number]) => s.trim().length >= min && s.trim().length <= max;

export function validateDraft(d: RequestDraft): Partial<Record<keyof RequestDraft, string>> {
  const e: Partial<Record<keyof RequestDraft, string>> = {};
  if (!within(d.title, LIMITS.title)) e.title = `Title must be ${LIMITS.title[0]}–${LIMITS.title[1]} characters.`;
  if (!d.category) e.category = "Select a category.";
  if (!within(d.description, LIMITS.description)) e.description = `Description must be ${LIMITS.description[0]}–${LIMITS.description[1]} characters.`;
  if (!within(d.address, LIMITS.address)) e.address = `Street address must be ${LIMITS.address[0]}–${LIMITS.address[1]} characters.`;
  if (!within(d.suburb, LIMITS.suburb)) e.suburb = "Suburb is required.";
  return e;
}
export const isValid = (d: RequestDraft) => Object.keys(validateDraft(d)).length === 0;
