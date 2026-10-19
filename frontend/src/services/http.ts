import type { User, Role } from "../types";

/** Error raised for any non-2xx response. Body shape: { error: { code, message, violations? } } */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public violations: string[] = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const mem = new Map<string, string>();
const store = {
  get: (k: string): string | null => {
    try {
      return sessionStorage.getItem(k) ?? localStorage.getItem(k) ?? mem.get(k) ?? null;
    } catch {
      return mem.get(k) ?? null;
    }
  },
  set: (k: string, v: string) => {
    mem.set(k, v);
    try {
      sessionStorage.setItem(k, v);
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del: (k: string) => {
    mem.delete(k);
    try {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
};

export const session = {
  token: (): string | null => store.get("cc_token"),
  setToken: (t: string) => store.set("cc_token", t),
  user: (): User | null => {
    const raw = store.get("cc_user");
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser: (u: User) => store.set("cc_user", JSON.stringify(u)),
  clear: () => {
    store.del("cc_token");
    store.del("cc_user");
  }
};

// Dynamic base URL with environment variable support for Vite / CRA
const getBaseUrl = (): string => {
  const envUrl = (import.meta as any)?.env?.VITE_API_BASE || (import.meta as any)?.env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  }
  return "http://localhost:5000/api/v1";
};

type Opts = {
  method?: string;
  body?: unknown;
  raw?: boolean;
  headers?: Record<string, string>;
};

export async function http<T>(path: string, { method = "GET", body, raw = false, headers: customHeaders = {} }: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...customHeaders
  };

  const token = session.token();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const fullUrl = `${getBaseUrl()}${normalizedPath}`;

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let e: { code?: string; message?: string; violations?: string[] } = {};
    try {
      const json = await res.json();
      e = json.error || json;
    } catch {
      /* fallback to default error values */
    }

    // Do not trigger global logout on bad credentials during login/registration
    const isAuthRoute = path.includes("/auth/");
    if (res.status === 401 && !isAuthRoute) {
      session.clear();
      window.dispatchEvent(new Event("cc:unauthorised"));
    }

    throw new ApiError(
      res.status,
      e.code ?? `HTTP_${res.status}`,
      e.message ?? "Something went wrong.",
      e.violations ?? []
    );
  }

  if (raw) return res as unknown as T;
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Convenience API namespace for typed backend interactions */
export const api = {
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      const data = await http<{ token: string; user: any }>("/auth/login", {
        method: "POST",
        body: credentials
      });
      if (data.token) session.setToken(data.token);
      if (data.user) {
        const u = normalizeUser(data.user);
        session.setUser(u);
        return { token: data.token, user: u };
      }
      return data;
    },

    register: async (payload: { fullName: string; email: string; password: string }) => {
      const data = await http<{ token: string; user: any }>("/auth/register", {
        method: "POST",
        body: payload
      });
      if (data.token) session.setToken(data.token);
      if (data.user) {
        const u = normalizeUser(data.user);
        session.setUser(u);
        return { token: data.token, user: u };
      }
      return data;
    },

    registerStaff: async (payload: { fullName: string; email: string; password: string; role?: string }) => {
      const data = await http<{ token: string; user: any }>("/auth/register-staff", {
        method: "POST",
        body: payload
      });
      if (data.token) session.setToken(data.token);
      if (data.user) {
        const u = normalizeUser(data.user);
        session.setUser(u);
        return { token: data.token, user: u };
      }
      return data;
    }
  },

  requests: {
    list: (page = 1, pageSize = 10) =>
      http<{ items: any[]; total: number }>(`/requests?page=${page}&pageSize=${pageSize}`),
    getById: (id: string) => http<any>(`/requests/${id}`),
    create: (payload: any) => http<any>("/requests", { method: "POST", body: payload }),
    assign: (id: string, staffId: string) =>
      http<any>(`/requests/${id}/assign`, { method: "PATCH", body: { staffId } }),
    updateStatus: (id: string, status: string) =>
      http<any>(`/requests/${id}/status`, { method: "PATCH", body: { status } })
  },

  staff: {
    list: () => http<{ items: any[]; total: number }>("/staff")
  }
};

/** Helper to align backend response shapes with the frontend User model */
function normalizeUser(rawUser: any): User {
  const roleStr = (rawUser.role || "Citizen").toLowerCase();
  const role: Role =
    roleStr === "staff"
      ? ("Staff" as Role)
      : roleStr === "supervisor"
      ? ("Supervisor" as Role)
      : roleStr === "admin"
      ? ("Admin" as Role)
      : ("Citizen" as Role);

  return {
    id: String(rawUser.id || rawUser.user_id || ""),
    name: rawUser.name || rawUser.full_name || rawUser.email,
    email: rawUser.email,
    role
  } as User;
}