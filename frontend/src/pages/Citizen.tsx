import { useEffect, useState } from "react";
import { api } from "../services/api";
import { ApiError } from "../services/http";
import { validateDraft } from "../services/validation";
import { CATEGORIES, type Category, type RequestDraft, type ServiceRequest, type User } from "../types";
import { Errors, Field, Pager, StatusBadge, StatusPill, fmt } from "../components/ui";

const EMPTY: RequestDraft = { title: "", category: "", description: "", address: "", suburb: "" };

// FR-001: structured request submission with inline validation (limits mirror the DB CHECK constraints)
export function SubmitRequest({ user, onDone }: { user: User; onDone: () => void }) {
  const [f, setF] = useState(EMPTY), [touched, setTouched] = useState(false), [code, setCode] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const errors = validateDraft(f);
  const set = (k: keyof RequestDraft) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setTouched(true); setServerErrors([]);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try { setCode((await api.createRequest(user, { ...f, category: f.category as Category })).trackingCode); }
    catch (e) { setServerErrors(e instanceof ApiError && e.violations.length ? e.violations : [(e as Error).message]); }
    finally { setBusy(false); }
  };
  if (code) return (
    <section className="screen narrow"><h2>Request submitted ✔</h2>
      <p>Your tracking reference is <strong className="code">{code}</strong>.</p>
      <button className="primary" onClick={onDone}>View my requests</button></section>);
  const e = (k: keyof RequestDraft) => (touched ? errors[k] : "");
  return (
    <section className="screen narrow"><h2>Submit a service request</h2>
      <Field label="Title" hint="(5–100 chars)" error={e("title")}><input value={f.title} onChange={set("title")} maxLength={100} /></Field>
      <Field label="Category" error={e("category")}>
        <select value={f.category} onChange={set("category")}><option value="">Select…</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Description" hint={`(${f.description.length}/2000, min 20)`} error={e("description")}>
        <textarea rows={5} value={f.description} onChange={set("description")} maxLength={2000} /></Field>
      <div className="row2">
        <Field label="Street address" hint="(min 10 chars)" error={e("address")}><input value={f.address} onChange={set("address")} maxLength={255} /></Field>
        <Field label="Suburb" error={e("suburb")}><input value={f.suburb} onChange={set("suburb")} maxLength={100} /></Field></div>
      <Errors list={serverErrors} />
      <button className="primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit request"}</button>
    </section>);
}

// FR-002 / FR-003: paginated own-request list and public timeline
export function MyRequests({ user }: { user: User }) {
  const [page, setPage] = useState(1), [size, setSize] = useState(10), [error, setError] = useState("");
  const [data, setData] = useState<{ total: number; items: ServiceRequest[] }>({ total: 0, items: [] });
  const [open, setOpen] = useState<ServiceRequest | null>(null);
  useEffect(() => { api.myRequests(user, page, size).then(setData).catch(e => setError((e as Error).message)); }, [user, page, size]);
  const view = async (r: ServiceRequest) => { const full = await api.getRequest(r.id); setOpen(full ?? r); };
  if (open) return <Timeline r={open} onBack={() => setOpen(null)} />;
  return (
    <section className="screen"><h2>My requests</h2><Errors list={error ? [error] : []} />
      <div className="tablewrap"><table><thead><tr><th>Tracking ID</th><th>Category</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.items.map(r => (
          <tr key={r.id}><td>{r.trackingCode}</td><td>{r.category}</td><td>{fmt(r.createdAt)}</td><td><StatusBadge r={r} /></td>
            <td><button className="link" onClick={() => view(r)}>View ›</button></td></tr>))}
          {!data.items.length && <tr><td colSpan={5} className="muted">No requests yet.</td></tr>}</tbody></table></div>
      <div className="toolbar"><label>Per page <select value={size} onChange={e => { setSize(+e.target.value); setPage(1); }}>
        {[10, 25, 50].map(n => <option key={n}>{n}</option>)}</select></label>
        <Pager page={page} pages={Math.max(1, Math.ceil(data.total / size))} onPage={setPage} /></div>
    </section>);
}

function Timeline({ r, onBack }: { r: ServiceRequest; onBack: () => void }) {
  return (
    <section className="screen narrow"><button className="link" onClick={onBack}>‹ Back</button>
      <h2>{r.title}</h2><p className="muted">{r.trackingCode} · {r.category} · <StatusBadge r={r} /></p>
      {r.resolutionNotes && <p className="callout">Official feedback: {r.resolutionNotes}</p>}
      <ol className="timeline">{[...(r.timeline ?? [])].reverse().map((t, i) => (
        <li key={i}><strong>{fmt(t.at)}</strong> — {t.department} <StatusPill s={t.status} /><br />{t.message}</li>))}</ol>
      <p className="muted small">Updates are read-only. Individual staff names are never shown.</p>
    </section>);
}
