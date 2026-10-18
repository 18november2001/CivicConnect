import { useEffect, useState } from "react";
import { api } from "../services/api";
import { CATEGORIES, STATUSES, type QueueFilters, type ServiceRequest, type SortKey, type Status, type User } from "../types";
import { Errors, Field, StatusBadge, fmt } from "../components/ui";
import { canAssign, label, statusChoices } from "../services/fsm";

const EMPTY: QueueFilters = { q: "", status: "", category: "", suburb: "", assignee: "", from: "", to: "" };
const nameOf = (staff: User[], id: string | null) => staff.find(u => u.id === id)?.name ?? "—";

// FR-004: multi-criteria filter, search and sort
export function Queue({ onOpen }: { onOpen: (r: ServiceRequest) => void }) {
  const [f, setF] = useState(EMPTY), [sort, setSort] = useState<SortKey>("slaDueAt"), [error, setError] = useState("");
  const [rows, setRows] = useState<ServiceRequest[]>([]), [staff, setStaff] = useState<User[]>([]), [suburbs, setSuburbs] = useState<string[]>([]);
  useEffect(() => { Promise.all([api.staff(), api.suburbs()]).then(([s, b]) => { setStaff(s); setSuburbs(b); }).catch(e => setError((e as Error).message)); }, []);
  useEffect(() => { api.queue(f, sort).then(setRows).catch(e => setError((e as Error).message)); }, [f, sort]);
  const set = (k: keyof QueueFilters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const th = (k: SortKey, t: string) => <th><button className="link" onClick={() => setSort(k)}>{t}{sort === k ? " ▲" : ""}</button></th>;
  return (
    <section className="screen"><h2>Request queue</h2><Errors list={error ? [error] : []} />
      <div className="filters">
        <input placeholder="🔍 Search title or ID" value={f.q} onChange={set("q")} />
        <select value={f.status} onChange={set("status")}><option value="">All statuses</option>{[...STATUSES, "Overdue"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <select value={f.category} onChange={set("category")}><option value="">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <select value={f.suburb} onChange={set("suburb")}><option value="">All suburbs</option>{suburbs.map(s => <option key={s}>{s}</option>)}</select>
        <select value={f.assignee} onChange={set("assignee")}><option value="">Any assignee</option><option value="none">Unassigned</option>
          {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <input type="date" value={f.from} onChange={set("from")} /><input type="date" value={f.to} onChange={set("to")} />
        <button className="ghost" onClick={() => setF(EMPTY)}>Clear</button></div>
      <div className="tablewrap"><table><thead><tr><th>ID</th><th>Title</th><th>Suburb</th>{th("status", "Status")}{th("slaDueAt", "SLA due")}{th("createdAt", "Created")}<th>Assignee</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className="click" onClick={() => onOpen(r)}><td>{r.trackingCode}</td><td>{r.title}</td><td>{r.suburb}</td>
            <td><StatusBadge r={r} /></td><td>{fmt(r.slaDueAt)}</td><td>{fmt(r.createdAt)}</td><td>{nameOf(staff, r.assignedStaffId)}</td></tr>))}
          {!rows.length && <tr><td colSpan={7} className="muted">No requests match.</td></tr>}</tbody></table></div>
      <p className="muted small">{rows.length} result(s)</p>
    </section>);
}

// FR-005 / FR-006: claim, assign and controlled status changes (W6). Backend remains the authority.
export function RequestDetail({ user, initial, onBack }: { user: User; initial: ServiceRequest; onBack: () => void }) {
  const [r, setR] = useState(initial), [to, setTo] = useState<Status | "">(""), [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(""), [errors, setErrors] = useState<string[]>([]), [staff, setStaff] = useState<User[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { // list rows may omit the timeline/audit trail, so load the full record
    api.getRequest(initial.id).then(x => x && setR(x)).catch(e => setErrors([(e as Error).message]));
    api.staff().then(setStaff).catch(() => undefined);
  }, [initial.id]);
  const choices = statusChoices(r.status, user.role), assignable = canAssign(r.status, user.role);
  const run = async (action: () => ReturnType<typeof api.assign>, after?: () => void) => {
    setBusy(true);
    try { const res = await action(); if (res.ok) { setR(res.req); setErrors([]); after?.(); } else setErrors(res.errors); }
    catch (e) { setErrors([(e as Error).message]); } finally { setBusy(false); }
  };
  const claim = () => run(() => api.assign(user, r.id, user.id, "Claimed by staff member", r.updatedAt));
  const doAssign = () => assignee ? run(() => api.assign(user, r.id, assignee, "Assigned", r.updatedAt), () => setAssignee("")) : setErrors(["Choose a staff member."]);
  const apply = () => to ? run(() => api.transition(user, r.id, to, note, r.updatedAt), () => { setTo(""); setNote(""); }) : setErrors(["Choose a status."]);
  return (
    <section className="screen"><button className="link" onClick={onBack}>‹ Queue</button>
      <h2>{r.title} <StatusBadge r={r} /></h2>
      <div className="split">
        <div>
          <div className="panel"><p className="muted small">{r.trackingCode} · {r.category}<br />{r.address}, {r.suburb} · SLA due {fmt(r.slaDueAt)}</p>
            <p>{r.description}</p><p className="small"><strong>Assigned to:</strong> {nameOf(staff, r.assignedStaffId)}</p></div>
          <h3>Internal audit history</h3>
          <ul className="audit">{[...(r.audit ?? [])].reverse().map((a, i) => (
            <li key={i}>{fmt(a.at)} · {a.actor} · {a.action} {a.from !== a.to && `${a.from} → ${a.to}`} {a.note && `· “${a.note}”`}</li>))}
            {!r.audit?.length && <li className="muted">No actions recorded yet.</li>}</ul>
        </div>
        <div className="panel">
          {assignable && <div className="toolbar tight">
            {!r.assignedStaffId && <button className="primary" disabled={busy} onClick={claim}>Claim</button>}
            <select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">{r.assignedStaffId ? "Reassign to…" : "Assign to…"}</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <button disabled={busy} onClick={doAssign}>{r.assignedStaffId ? "Reassign" : "Assign"}</button></div>}
          {choices.length ? <>
            <Field label="Change status"><select value={to} onChange={e => setTo(e.target.value as Status)}><option value="">Select…</option>
              {choices.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
            <Field label={to === "Rejected" ? "Rejection reason (min 15 chars)" : "Note (Resolved needs min 20 chars)"}>
              <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} /></Field>
            <Errors list={errors} /><button className="primary" disabled={busy} onClick={apply}>Apply change</button></>
            : <><Errors list={errors} /><p className="muted small">{assignable ? "No status changes available right now." : "No further changes available for your role in this state."}</p></>}
        </div>
      </div>
    </section>);
}
