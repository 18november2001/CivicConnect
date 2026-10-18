import type { Api } from "./contract";
import type { Category, Result, ServiceRequest, Status, User } from "../types";
import { CATEGORIES } from "../types";
import { allowedNext, canAssign, guards, isFinal, isOverdue } from "./fsm";

/** In-memory backend used for UI development and demos when VITE_API_MODE is not "live". */
const SLA_HOURS: Record<Category, number> = { Roads: 72, Water: 24, Electricity: 24, Refuse: 48, Sanitation: 48 };
/** Demo staff registration code for mock mode only. The real code is STAFF_REGISTRATION_CODE on the server. */
export const MOCK_STAFF_CODE = "STAFF-DEMO";
const hrs = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const USERS: User[] = [
  { id: "u1", name: "Thandi Citizen", email: "citizen@demo.test", role: "Citizen" },
  { id: "u2", name: "Sipho Staff", email: "staff@demo.test", role: "Staff", department: "Roads" },
  { id: "u3", name: "Sue Supervisor", email: "super@demo.test", role: "Supervisor", department: "Roads" },
];
const seed = (n: number, cat: Category, title: string, suburb: string, status: Status, dueIn: number, staff: string | null): ServiceRequest => ({
  id: `r${n}`, trackingCode: `REQ-20260930-${String(n).padStart(4, "0")}`, requesterId: "u1", category: cat, title,
  description: `${title}. Reported by a resident, please inspect as soon as possible.`, address: `${n} Church Street`, suburb,
  status, assignedStaffId: staff, slaDueAt: hrs(dueIn), createdAt: hrs(-30 - n), updatedAt: hrs(-30 - n),
  timeline: [{ at: hrs(-30 - n), status: "Submitted", message: "Request submitted.", department: "System" }], audit: [],
});
export const resetMock = () => { DB = [
  seed(1, "Roads", "Pothole on Church Street", "Hatfield", "Submitted", 40, null),
  seed(2, "Water", "Burst pipe near park", "Brooklyn", "In_Progress", -5, "u2"),
  seed(3, "Refuse", "Missed refuse collection", "Arcadia", "Assigned", 20, "u2"),
  seed(4, "Electricity", "Street light out", "Hatfield", "Resolved", 10, "u2"),
  seed(5, "Sanitation", "Blocked drain", "Sunnyside", "Closed", -50, "u2"),
]; };
let DB: ServiceRequest[] = []; resetMock();
const delay = <T,>(v: T) => new Promise<T>(r => setTimeout(() => r(v), 120));
const fail = (...errors: string[]) => delay<Result>({ ok: false, errors });
const stale = (r: ServiceRequest, exp: string) => !!exp && new Date(r.updatedAt).getTime() !== new Date(exp).getTime();
const STALE = "This request was changed by someone else. Reload it and try again.";

export const mockApi: Api = {
  async login(email, password) {
    const u = USERS.find(x => x.email === email.trim().toLowerCase());
    if (!u || password !== "password") throw new Error("Invalid email or password.");
    return delay(u);
  },
  async register(name, email, password) {
    if (name.trim().length < 2) throw new Error("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (USERS.some(u => u.email === email.trim().toLowerCase())) throw new Error("An account with this email already exists.");
    const u: User = { id: `u${USERS.length + 1}`, name: name.trim(), email: email.trim().toLowerCase(), role: "Citizen" };
    USERS.push(u); return delay(u);
  },
  async registerStaff(name, email, password, department, staffCode) {
    if (staffCode.trim() !== MOCK_STAFF_CODE) throw new Error("The staff registration code is not valid.");
    if (name.trim().length < 2) throw new Error("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (USERS.some(u => u.email === email.trim().toLowerCase())) throw new Error("An account with this email already exists.");
    const u: User = { id: `u${USERS.length + 1}`, name: name.trim(), email: email.trim().toLowerCase(), role: "Staff", department };
    USERS.push(u); return delay(u);
  },
  async createRequest(actor, d) {
    const n = DB.length + 1, at = new Date().toISOString();
    const r: ServiceRequest = { id: `r${n}`, trackingCode: `REQ-${at.slice(0, 10).replace(/-/g, "")}-${String(n).padStart(4, "0")}`, requesterId: actor.id,
      category: d.category, title: d.title, description: d.description, address: d.address, suburb: d.suburb, status: "Submitted", assignedStaffId: null,
      slaDueAt: hrs(SLA_HOURS[d.category]), createdAt: at, updatedAt: at, audit: [],
      timeline: [{ at, status: "Submitted", message: "Request submitted.", department: "System" }] };
    DB = [r, ...DB]; return delay(r);
  },
  async myRequests(actor, page, size) {
    const all = DB.filter(r => r.requesterId === actor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return delay({ total: all.length, items: all.slice((page - 1) * size, page * size) });
  },
  getRequest: id => delay(DB.find(r => r.id === id) ?? null),
  async queue(f, sort) {
    const q = f.q.toLowerCase();
    return delay(DB.filter(r =>
      (!q || r.title.toLowerCase().includes(q) || r.trackingCode.toLowerCase().includes(q)) &&
      (!f.status || (f.status === "Overdue" ? isOverdue(r) : r.status === f.status)) &&
      (!f.category || r.category === f.category) && (!f.suburb || r.suburb === f.suburb) &&
      (!f.assignee || (f.assignee === "none" ? !r.assignedStaffId : r.assignedStaffId === f.assignee)) &&
      (!f.from || r.createdAt >= f.from) && (!f.to || r.createdAt <= f.to + "T23:59:59")
    ).sort((a, b) => a[sort].localeCompare(b[sort])));
  },
  suburbs: () => delay([...new Set(DB.map(r => r.suburb))]),
  staff: () => delay(USERS.filter(u => u.role === "Staff" || u.role === "Supervisor")),

  async assign(actor, id, staffId, note, exp) {
    const r = DB.find(x => x.id === id); if (!r) return fail("Service request was not found.");
    if (stale(r, exp)) return fail(STALE);
    if (!canAssign(r.status, actor.role)) return fail(`Your role cannot assign a request that is ${r.status.replace("_", " ")}.`);
    if (!USERS.some(u => u.id === staffId && (u.role === "Staff" || u.role === "Supervisor"))) return fail("The assigned staff member is not an active user.");
    const at = new Date().toISOString(), from = r.status;
    r.assignedStaffId = staffId; r.status = "Assigned"; r.updatedAt = at;
    r.audit!.push({ at, actor: actor.name, action: "STAFF_ASSIGNED", from, to: "Assigned", note });
    r.timeline!.push({ at, status: "Assigned", message: "Request accepted and assigned.", department: actor.department ?? "Municipality" });
    return delay<Result>({ ok: true, req: { ...r } });
  },
  async transition(actor, id, to, note, exp) {
    const r = DB.find(x => x.id === id); if (!r) return fail("Service request was not found.");
    if (stale(r, exp)) return fail(STALE);
    const errors = guards(to, note, !!r.assignedStaffId);
    if (to === "Assigned") errors.push("Use the Assign control to assign or reassign a request.");
    else if (!allowedNext(r.status, actor.role).includes(to)) errors.push(`Transition ${r.status} -> ${to} is not permitted for your role.`);
    if (errors.length) return fail(...errors);
    const at = new Date().toISOString();
    r.audit!.push({ at, actor: actor.name, action: "STATUS_CHANGE", from: r.status, to, note });
    r.timeline!.push({ at, status: to, message: note || `Status changed to ${to.replace("_", " ")}.`, department: actor.department ?? "Municipality" });
    if (to === "Resolved") r.resolutionNotes = note;
    if (to === "Rejected") r.rejectionReason = note;
    r.status = to; r.updatedAt = at; return delay<Result>({ ok: true, req: { ...r } });
  },
  async stats() {
    const c = (f: (r: ServiceRequest) => boolean) => DB.filter(f).length;
    return delay({ open: c(r => r.status === "Submitted"), assigned: c(r => r.status === "Assigned"), inProgress: c(r => r.status === "In_Progress"),
      overdue: c(isOverdue), closed: c(r => r.status === "Closed"),
      byCategory: CATEGORIES.map(k => ({ category: k, count: c(r => r.category === k && !isFinal(r.status)) })) });
  },
  async exportReport(format, status, category) {
    const rows = DB.filter(r => (!status || r.status === status) && (!category || r.category === category)).map(r => ({
      trackingCode: r.trackingCode, category: r.category, createdAt: r.createdAt, status: r.status,
      turnaroundHours: Math.round((Date.now() - new Date(r.createdAt).getTime()) / 3600_000) }));
    const head = ["trackingCode", "category", "createdAt", "status", "turnaroundHours"];
    const text = format === "json" ? JSON.stringify(rows, null, 2) : [head.join(","), ...rows.map(r => head.map(h => (r as Record<string, unknown>)[h]).join(","))].join("\n");
    return { filename: `civicconnect-export.${format}`, blob: new Blob([text], { type: format === "json" ? "application/json" : "text/csv" }) };
  },
};
