import type { Category, QueueFilters, RequestDraft, Result, ServiceRequest, SortKey, Stats, Status, User } from "../types";

/** Everything the screens need from a backend. Implemented by api.mock.ts and api.live.ts (see docs/api/frontend-api-contract.md). */
export interface Api {
  login(email: string, password: string): Promise<User>;
  register(name: string, email: string, password: string): Promise<User>;
  createRequest(actor: User, draft: RequestDraft & { category: Category }): Promise<ServiceRequest>;
  myRequests(actor: User, page: number, size: number): Promise<{ total: number; items: ServiceRequest[] }>;
  getRequest(id: string): Promise<ServiceRequest | null>;
  queue(f: QueueFilters, sort: SortKey): Promise<ServiceRequest[]>;
  suburbs(): Promise<string[]>;
  staff(): Promise<User[]>;
  assign(actor: User, id: string, staffId: string, note: string, expectedUpdatedAt: string): Promise<Result>;
  transition(actor: User, id: string, to: Status, note: string, expectedUpdatedAt: string): Promise<Result>;
  stats(): Promise<Stats>;
  exportReport(format: "csv" | "json", status: string, category: string): Promise<{ filename: string; blob: Blob }>;
}
