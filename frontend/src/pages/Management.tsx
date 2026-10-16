import { useEffect, useState } from "react";
import { api } from "../services/api";
import { CATEGORIES, type Stats } from "../types";

const download = (name: string, blob: Blob) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

// FR-007 dashboard + FR-008 export
export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null), [status, setStatus] = useState(""), [cat, setCat] = useState(""), [err, setErr] = useState("");
  useEffect(() => { api.stats().then(setS).catch(e => setErr((e as Error).message)); }, []);
  if (!s) return <p className={err ? "err" : "muted"}>{err || "Loading…"}</p>;
  const max = Math.max(1, ...s.byCategory.map(c => c.count));
  const tiles: [string, number][] = [["Open", s.open], ["Assigned", s.assigned], ["In Progress", s.inProgress], ["Overdue", s.overdue], ["Closed", s.closed]];
  const exp = async (kind: "csv" | "json") => {
    try { const { filename, blob } = await api.exportReport(kind, status, cat); download(filename, blob); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <section className="screen"><h2>Service oversight</h2>
      <div className="tiles">{tiles.map(([t, n]) => <div key={t} className={`tile ${t === "Overdue" ? "warn" : ""}`}><b>{n}</b>{t}</div>)}</div>
      <h3>Active requests by category</h3>
      <div className="bars">{s.byCategory.map(c => (
        <div key={c.category}><div className="bar" style={{ height: `${(c.count / max) * 100}%` }}><span>{c.count}</span></div><small>{c.category}</small></div>))}</div>
      <h3>Export</h3>
      <div className="toolbar">
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>
          {["Submitted", "Assigned", "In_Progress", "Resolved", "Closed", "Rejected"].map(x => <option key={x}>{x}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <button onClick={() => exp("csv")}>Export CSV</button><button className="ghost" onClick={() => exp("json")}>Export JSON</button></div>
      {err && <p className="err">{err}</p>}
      <p className="muted small">Exports contain tracking IDs, categories, dates, turnaround hours and status only.</p>
    </section>);
}
