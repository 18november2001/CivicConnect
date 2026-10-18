import { useState } from "react";
import { api } from "../services/api";
import { CATEGORIES, type Category, type User } from "../types";
import { Errors, Field } from "../components/ui";

type Mode = "login" | "register" | "staff";
const TITLE: Record<Mode, string> = { login: "Log in", register: "Create citizen account", staff: "Staff sign-up" };
const BUTTON: Record<Mode, string> = { login: "Log in", register: "Create account", staff: "Create staff account" };

// W1 · Login / Citizen register / Staff sign-up (NFR-001)
export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState<string[]>([]);
  const [dept, setDept] = useState<Category | "">(""), [code, setCode] = useState(""), [busy, setBusy] = useState(false);
  const switchTo = (m: Mode) => { setErr([]); setPw(""); setMode(m); };
  const submit = async () => {
    if (mode === "staff" && !dept) { setErr(["Choose your department."]); return; }
    setBusy(true); setErr([]);
    try {
      onLogin(mode === "login" ? await api.login(email, pw)
        : mode === "register" ? await api.register(name, email, pw)
        : await api.registerStaff(name, email, pw, dept as Category, code));
    } catch (e) { setErr([(e as Error).message]); }
    finally { setBusy(false); }
  };
  return (
    <>
      <header className="nav"><strong className="brand"><i className="logo-dot" />CivicConnect</strong></header>
      <main className="auth">
        <h1>{TITLE[mode]}</h1>
        {mode !== "login" && <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" /></Field>
        <Field label="Password" hint={mode === "login" ? "" : "(min 8 characters)"}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"}
            onKeyDown={e => { if (e.key === "Enter" && mode === "login") void submit(); }} /></Field>
        {mode === "staff" && <>
          <Field label="Department"><select value={dept} onChange={e => setDept(e.target.value as Category | "")}>
            <option value="">Select…</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Staff registration code" hint="(from your supervisor or HR)"><input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" /></Field></>}
        <Errors list={err} />
        <button className="primary block" disabled={busy} onClick={submit}>{busy ? "Please wait…" : BUTTON[mode]}</button>
        {mode !== "login" && <button className="link center" onClick={() => switchTo("login")}>I already have an account</button>}
        {mode === "login" && <>
          <button className="link center" onClick={() => switchTo("register")}>Create citizen account</button>
          <button className="link center" onClick={() => switchTo("staff")}>Municipal staff? Sign up here</button></>}
        {mode === "login" && <p className="muted small center">Demo (mock mode): citizen@demo.test · staff@demo.test · super@demo.test<br />password: <code>password</code></p>}
        {mode === "staff" && <p className="muted small center">Mock mode code: <code>STAFF-DEMO</code>. Supervisor and admin accounts are created by an administrator.</p>}
      </main>
    </>
  );
}
