import type { User } from "../types";

/** Error raised for any non-2xx response. Body shape: { error: { code, message, violations? } } (see docs/api). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public violations: string[] = []) { super(message); }
}

// sessionStorage with an in-memory fallback so the module also works in tests / private mode.
const mem = new Map<string, string>();
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set: (k: string, v: string) => { mem.set(k, v); try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { mem.delete(k); try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
export const session = {
  token: () => store.get("cc_token"),
  setToken: (t: string) => store.set("cc_token", t),
  user: (): User | null => { const raw = store.get("cc_user"); try { return raw ? JSON.parse(raw) as User : null; } catch { return null; } },
  setUser: (u: User) => store.set("cc_user", JSON.stringify(u)),
  clear: () => { store.del("cc_token"); store.del("cc_user"); },
};

const base = () => import.meta.env.VITE_API_BASE ?? "/api/v1";
type Opts = { method?: string; body?: unknown; raw?: boolean };

export async function http<T>(path: string, { method = "GET", body, raw = false }: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try { res = await fetch(base() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again."); }
  if (!res.ok) {
    let e: { code?: string; message?: string; violations?: string[] } = {};
    try { e = (await res.json()).error ?? {}; } catch { /* non-JSON error body */ }
    if (res.status === 401 && path !== "/auth/login") { session.clear(); window.dispatchEvent(new Event("cc:unauthorised")); }
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? "Something went wrong.", e.violations ?? []);
  }
  if (raw) return res as unknown as T;
  return (res.status === 204 ? undefined : await res.json()) as T;
}
