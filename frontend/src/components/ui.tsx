import type { ReactNode } from "react";
import type { ServiceRequest, Status, User } from "../types";
import { isOverdue, label } from "../services/fsm";

export const fmt = (iso: string) => new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

export function StatusBadge({ r }: { r: ServiceRequest }) {
  const overdue = isOverdue(r);
  return <span className={`badge s-${overdue ? "Overdue" : r.status}`}>{overdue ? "Overdue" : label(r.status)}</span>;
}
export const StatusPill = ({ s }: { s: Status }) => <span className={`badge s-${s}`}>{label(s)}</span>;

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}{hint && <small> {hint}</small>}</span>{children}{error && <em className="err">{error}</em>}</label>;
}
export function Errors({ list }: { list: string[] }) {
  return list.length ? <ul className="errors">{list.map(e => <li key={e}>{e}</li>)}</ul> : null;
}
export function Nav({ user, items, view, onNav, onLogout }: {
  user: User; items: { id: string; label: string }[]; view: string; onNav: (v: string) => void; onLogout: () => void }) {
  return (
    <header className="nav">
      <strong className="brand"><i className="logo-dot" />CivicConnect</strong>
      <nav>{items.map(i => <button key={i.id} className={view === i.id ? "on" : ""} onClick={() => onNav(i.id)}>{i.label}</button>)}</nav>
      <span className="who">{user.name} · {user.role}</span>
      <span className="avatar" title={user.name} />
      <button className="ghost small-btn" onClick={onLogout}>Log out</button>
    </header>
  );
}
export const Pager = ({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) => (
  <div className="pager"><button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
    <span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button></div>
);
