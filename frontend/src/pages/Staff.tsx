import { useEffect, useState } from "react";
import { api } from "../services/api";
import {
  CATEGORIES,
  STATUSES,
  type QueueFilters,
  type ServiceRequest,
  type SortKey,
  type Status,
  type User
} from "../types";
import { Errors, Field, StatusBadge, fmt } from "../components/ui";
import { canAssign } from "../services/fsm";

const EMPTY: QueueFilters = {
  q: "",
  status: "",
  category: "",
  suburb: "",
  assignee: "",
  from: "",
  to: ""
};

const nameOf = (staff: User[], id: string | null | undefined) =>
  staff.find((u) => String(u.id) === String(id))?.name ?? "—";

function normalizeRequest(r: any): ServiceRequest {
  if (!r) return r;
  return {
    ...r,
    id: String(r.id || r.request_id || ""),
    trackingCode: r.trackingCode || r.tracking_code || "",
    category: r.category || r.categoryName || r.category_name || "General",
    address: r.address || r.locationAddress || r.location_address || "—",
    suburb: r.suburb || "—",
    status: r.status || "Submitted",
    assignedStaffId: r.assignedStaffId || r.assigned_staff_id || r.assigned_to || null,
    slaDueAt: r.slaDueAt || r.sla_due_at || null,
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    updatedAt: r.updatedAt || r.updated_at || r.createdAt || new Date().toISOString(),
    audit: Array.isArray(r.audit) ? r.audit : []
  } as ServiceRequest;
}

// FR-004: Multi-criteria filter, search and sort
export function Queue({
  onOpen,
  refreshSignal
}: {
  onOpen: (r: ServiceRequest) => void;
  refreshSignal?: number;
}) {
  const [f, setF] = useState<QueueFilters>(EMPTY);
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortKey>("slaDueAt");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [suburbs, setSuburbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.staff(), api.suburbs()])
      .then(([s, b]) => {
        const staffList = Array.isArray(s) ? s : (s as any)?.items || [];
        const suburbList = Array.isArray(b) ? b : (b as any)?.items || [];
        setStaff(staffList);
        setSuburbs(suburbList);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const fetchQueue = (filtersToUse = f) => {
    setLoading(true);
    api
      .queue(filtersToUse, sort)
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : (data as any)?.items || (data as any)?.requests || [];
        setRows(list.map(normalizeRequest));
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue(f);
  }, [f.status, f.category, f.suburb, f.assignee, f.from, f.to, sort, refreshSignal]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated = { ...f, q: searchInput.trim() };
    setF(updated);
    fetchQueue(updated);
  };

  const handleClear = () => {
    setSearchInput("");
    setF(EMPTY);
    fetchQueue(EMPTY);
  };

  const setFilterField = (k: keyof QueueFilters) => (e: { target: { value: string } }) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  };

  // Immediate in-memory filtering fallback so search reacts instantly
  const filteredRows = rows.filter((r) => {
    if (f.q) {
      const term = f.q.toLowerCase();
      const matchTitle = (r.title || "").toLowerCase().includes(term);
      const matchCode = (r.trackingCode || "").toLowerCase().includes(term);
      const matchAddress = (r.address || "").toLowerCase().includes(term);
      const matchSuburb = (r.suburb || "").toLowerCase().includes(term);
      if (!matchTitle && !matchCode && !matchAddress && !matchSuburb) return false;
    }
    if (f.status && f.status !== "Overdue") {
      const normStatus = r.status.replace("_", " ").toLowerCase();
      const filterStatus = f.status.replace("_", " ").toLowerCase();
      if (normStatus !== filterStatus) return false;
    }
    if (f.category && (r.category || "").toLowerCase() !== f.category.toLowerCase()) {
      return false;
    }
    if (f.suburb && (r.suburb || "").toLowerCase() !== f.suburb.toLowerCase()) {
      return false;
    }
    if (f.assignee) {
      if (f.assignee === "none" && r.assignedStaffId) return false;
      if (f.assignee !== "none" && String(r.assignedStaffId) !== String(f.assignee)) return false;
    }
    return true;
  });

  const th = (k: SortKey, t: string) => (
    <th>
      <button className="link" onClick={() => setSort(k)}>
        {t}
        {sort === k ? " ▲" : ""}
      </button>
    </th>
  );

  return (
    <section className="screen">
      <h2>Request queue</h2>
      <Errors list={error ? [error] : []} />

      <form className="filters" onSubmit={handleSearchSubmit}>
        <input
          placeholder="🔍 Search title or ID (press Enter)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearchSubmit(e);
          }}
        />
        <select value={f.status} onChange={setFilterField("status")}>
          <option value="">All statuses</option>
          {[...STATUSES, "Overdue"].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select value={f.category} onChange={setFilterField("category")}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={f.suburb} onChange={setFilterField("suburb")}>
          <option value="">All suburbs</option>
          {suburbs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={f.assignee} onChange={setFilterField("assignee")}>
          <option value="">Any assignee</option>
          <option value="none">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" value={f.from} onChange={setFilterField("from")} />
        <input type="date" value={f.to} onChange={setFilterField("to")} />

        <button type="submit" className="primary">
          Search
        </button>
        <button type="button" className="ghost" onClick={handleClear}>
          Clear
        </button>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Suburb</th>
              {th("status", "Status")}
              {th("slaDueAt", "SLA due")}
              {th("createdAt", "Created")}
              <th>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id} className="click" onClick={() => onOpen(r)}>
                <td>{r.trackingCode}</td>
                <td>{r.title}</td>
                <td>{r.suburb}</td>
                <td>
                  <StatusBadge r={r} />
                </td>
                <td>{fmt(r.slaDueAt)}</td>
                <td>{fmt(r.createdAt)}</td>
                <td>{nameOf(staff, r.assignedStaffId)}</td>
              </tr>
            ))}
            {!filteredRows.length && (
              <tr>
                <td colSpan={7} className="muted">
                  {loading ? "Loading..." : "No requests match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">{filteredRows.length} result(s)</p>
    </section>
  );
}

// FR-005 / FR-006: Claim, assign and Accept/Reject status transitions
export function RequestDetail({
  user,
  initial,
  onBack
}: {
  user: User;
  initial: ServiceRequest;
  onBack: () => void;
}) {
  const [r, setR] = useState<ServiceRequest>(() => normalizeRequest(initial));
  const [to, setTo] = useState<Status | "">("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ticketId = initial.id || (initial as any).request_id;
    api
      .getRequest(ticketId)
      .then((x) => x && setR(normalizeRequest(x)))
      .catch((e) => setErrors([(e as Error).message]));

    api
      .staff()
      .then((res) => {
        const staffList = Array.isArray(res) ? res : (res as any)?.items || [];
        setStaff(staffList);
      })
      .catch(() => undefined);
  }, [initial.id]);

  const assignable =
    canAssign(r.status, user.role) ||
    !["Resolved", "Closed", "Rejected"].includes(r.status);

  const run = async (
    action: () => ReturnType<typeof api.assign>,
    after?: () => void
  ) => {
    setBusy(true);
    try {
      const res = await action();
      if (res.ok) {
        setR(normalizeRequest(res.req));
        setErrors([]);
        after?.();
      } else {
        setErrors(res.errors || ["An unexpected error occurred."]);
      }
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  const claim = () =>
    run(
      () => api.assign(user, r.id, user.id, "Claimed by staff member", r.updatedAt),
      () => onBack()
    );

  const doAssign = () =>
    assignee
      ? run(
          () => api.assign(user, r.id, assignee, "Assigned", r.updatedAt),
          () => {
            setAssignee("");
            onBack();
          }
        )
      : setErrors(["Choose a staff member."]);

  const apply = () => {
    if (!to) {
      setErrors(["Choose a status."]);
      return;
    }
    run(
      () => api.transition(user, r.id, to, note, r.updatedAt),
      () => {
        setTo("");
        setNote("");
        onBack();
      }
    );
  };

  return (
    <section className="screen">
      <button className="link" onClick={onBack}>
        ‹ Queue
      </button>
      <h2>
        {r.title} <StatusBadge r={r} />
      </h2>
      <div className="split">
        <div>
          <div className="panel">
            <p className="muted small">
              {r.trackingCode} · {r.category}
              <br />
              {r.address}, {r.suburb} · SLA due {fmt(r.slaDueAt)}
            </p>
            <p>{r.description}</p>
            <p className="small">
              <strong>Assigned to:</strong> {nameOf(staff, r.assignedStaffId)}
            </p>
          </div>

          <h3>Internal audit history</h3>
          <ul className="audit">
            {[...(r.audit ?? [])].reverse().map((a, i) => (
              <li key={i}>
                {fmt(a.at)} · {a.actor} · {a.action}{" "}
                {a.from !== a.to && `${a.from} → ${a.to}`}{" "}
                {a.note && `· “${a.note}”`}
              </li>
            ))}
            {!r.audit?.length && (
              <li className="muted">No actions recorded yet.</li>
            )}
          </ul>
        </div>

        <div className="panel">
          {assignable && (
            <div className="toolbar tight">
              {!r.assignedStaffId && (
                <button className="primary" disabled={busy} onClick={claim}>
                  Claim
                </button>
              )}
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">
                  {r.assignedStaffId ? "Reassign to…" : "Assign to…"}
                </option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button disabled={busy} onClick={doAssign}>
                {r.assignedStaffId ? "Reassign" : "Assign"}
              </button>
            </div>
          )}

          <Field label="Change status">
            <select
              value={to}
              onChange={(e) => setTo(e.target.value as Status)}
            >
              <option value="">Select…</option>
              <option value="In_Progress">Accept</option>
              <option value="Rejected">Reject</option>
            </select>
          </Field>

          <Field
            label={
              to === "Rejected"
                ? "Rejection reason (min 15 chars)"
                : "Note (min 5 chars)"
            }
          >
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                to === "Rejected"
                  ? "State reason for rejecting the request..."
                  : "Add operational note..."
              }
            />
          </Field>

          <Errors list={errors} />
          <button className="primary" disabled={busy} onClick={apply}>
            Apply change
          </button>
        </div>
      </div>
    </section>
  );
}

// Main Page Component
export default function StaffPage({ user }: { user: User }) {
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleBack = () => {
    setSelectedRequest(null);
    setRefreshSignal((prev) => prev + 1);
  };

  if (selectedRequest) {
    return (
      <RequestDetail
        user={user}
        initial={selectedRequest}
        onBack={handleBack}
      />
    );
  }

  return (
    <Queue
      key={refreshSignal}
      refreshSignal={refreshSignal}
      onOpen={(r) => setSelectedRequest(r)}
    />
  );
}