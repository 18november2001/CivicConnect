export type Role = "Citizen" | "Staff" | "Supervisor" | "Admin";
export type Status = "Submitted" | "Assigned" | "In_Progress" | "Resolved" | "Closed" | "Rejected";
export type Category = "Roads" | "Water" | "Electricity" | "Refuse" | "Sanitation";
export const CATEGORIES: Category[] = ["Roads", "Water", "Electricity", "Refuse", "Sanitation"];
export const STATUSES: Status[] = ["Submitted", "Assigned", "In_Progress", "Resolved", "Closed", "Rejected"];

export interface User { id: string; name: string; email: string; role: Role; department?: Category }
export interface TimelineEntry { at: string; status: Status; message: string; department: string }
export interface AuditEntry { at: string; actor: string; action: string; from: Status | null; to: Status; note?: string }
export interface ServiceRequest {
  id: string; trackingCode: string; requesterId: string; category: Category; title: string; description: string;
  address: string; suburb: string; status: Status; assignedStaffId: string | null;
  resolutionNotes?: string; rejectionReason?: string; slaDueAt: string; createdAt: string; updatedAt: string;
  timeline?: TimelineEntry[]; audit?: AuditEntry[]; // audit only returned to Staff/Supervisor/Admin
}
export interface QueueFilters { q: string; status: string; category: string; suburb: string; assignee: string; from: string; to: string }
export interface RequestDraft { title: string; category: Category | ""; description: string; address: string; suburb: string }
export interface Stats { open: number; assigned: number; inProgress: number; overdue: number; closed: number; byCategory: { category: Category; count: number }[] }
export type Result = { ok: true; req: ServiceRequest } | { ok: false; errors: string[] };
export type SortKey = "createdAt" | "slaDueAt" | "status";
