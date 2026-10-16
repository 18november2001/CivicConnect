// Basis: FR-001 acceptance criteria; limits mirror service_requests CHECK constraints. Technique: boundary value analysis.
import { describe, expect, it } from "vitest";
import { isValid, validateDraft } from "../src/services/validation";
import type { RequestDraft } from "../src/types";

const ok: RequestDraft = { title: "Pothole", category: "Roads", description: "A deep pothole near the school gate.", address: "12 Church Street", suburb: "Hatfield" };
const len = (n: number) => "x".repeat(n);

describe("FE-BB-01 request draft validation (FR-001)", () => {
  it("accepts a fully valid draft", () => expect(isValid(ok)).toBe(true));
  it.each([[4, false], [5, true], [100, true], [101, false]])("title of %i chars valid=%s", (n, v) => expect(!validateDraft({ ...ok, title: len(n) }).title).toBe(v));
  it.each([[19, false], [20, true], [2000, true], [2001, false]])("description of %i chars valid=%s", (n, v) => expect(!validateDraft({ ...ok, description: len(n) }).description).toBe(v));
  it.each([[9, false], [10, true], [255, true], [256, false]])("address of %i chars valid=%s", (n, v) => expect(!validateDraft({ ...ok, address: len(n) }).address).toBe(v));
  it("rejects a missing category and blank suburb", () => {
    const e = validateDraft({ ...ok, category: "", suburb: "  " });
    expect(e.category).toBeDefined(); expect(e.suburb).toBeDefined();
  });
});
