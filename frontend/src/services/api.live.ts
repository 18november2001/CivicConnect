import type { Api } from "./contract";
import type { Result, ServiceRequest, Stats, User } from "../types";
import { ApiError, http, session } from "./http";
 
const qs = (o: Record<string, string | number>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};
 
/** Turn a rejected write into the {ok:false, errors} shape the screens render (FR-006). */
const asResult = async (call: () => Promise<ServiceRequest>): Promise<Result> => {
  try {
    return { ok: true, req: await call() };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.code === "CONCURRENT_MODIFICATION") {
      return { ok: false, errors: ["This request was changed by someone else. Reload it and try again."] };
    }
    if (e.status === 403) {
      return { ok: false, errors: ["Your role is not permitted to do this."] };
    }
    return { ok: false, errors: e.violations.length ? e.violations : [e.message] };
  }
};
 
export const liveApi: Api = {
  async login(email, password) {
    const r = await http<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    session.setToken(r.token);
    session.setUser(r.user);
    return r.user;
  },
 
  async register(name, email, password) {
    const r = await http<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { fullName: name, email, password }
    });
    session.setToken(r.token);
    session.setUser(r.user);
    return r.user;
  },
 
  createRequest: (_a, d) =>
    http<ServiceRequest>("/requests", {
      method: "POST",
      body: {
        title: d.title.trim(),
        category: d.category,
        description: d.description.trim(),
        locationAddress: d.address.trim(),
        suburb: d.suburb.trim()
      }
    }),
 
  myRequests: (_a, page, size) =>
    http("/requester/requests" + qs({ page, pageSize: size })),
 
  async getRequest(id) {
    try {
      return await http<ServiceRequest>(`/requests/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
 
  async queue(f, sort) {
    return (await http<{ items: ServiceRequest[] }>("/requests" + qs({ ...f, sort }))).items;
  },
 
  suburbs: () => http<string[]>("/requests/suburbs"),
 
  staff: () => http<User[]>("/users?role=staff"),
 
  assign: (_a, id, staffId, note, expectedUpdatedAt) =>
    asResult(() =>
      http<ServiceRequest>(`/requests/${encodeURIComponent(id)}/assign`, {
        method: "PATCH",
        body: { staffId, handoverNotes: note, expectedUpdatedAt }
      })
    ),
 
  transition: (_a, id, to, note, expectedUpdatedAt) =>
    asResult(() =>
      http<ServiceRequest>(`/requests/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { targetStatus: to, notes: note, expectedUpdatedAt }
      })
    ),
 
  stats: () => http<Stats>("/reports/summary"),
 
  async exportReport(format, status, category) {
    const res = await http<Response>("/reports/export" + qs({ format, status, category }), { raw: true });
    return { filename: `civicconnect-export.${format}`, blob: await res.blob() };
  }
};
 