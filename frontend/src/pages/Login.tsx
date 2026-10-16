import { useState } from "react";
import { api } from "../services/api";
import type { User } from "../types";
import { Errors, Field } from "../components/ui";

// W1 · Login / Register (NFR-001)
export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState<string[]>([]);
  const submit = async () => {
    try { onLogin(mode === "login" ? await api.login(email, pw) : await api.register(name, email, pw)); }
    catch (e) { setErr([(e as Error).message]); }
  };
  return (
    <>
      <header className="nav"><strong className="brand"><i className="logo-dot" />CivicConnect</strong></header>
      <main className="auth">
        <h1>{mode === "login" ? "Log in" : "Create citizen account"}</h1>
        {mode === "register" && <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} /></Field>}
        <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Password"><input type="password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Errors list={err} />
        <button className="primary block" onClick={submit}>{mode === "login" ? "Log in" : "Create account"}</button>
        <button className="link center" onClick={() => { setErr([]); setMode(mode === "login" ? "register" : "login"); }}>
          {mode === "login" ? "Create citizen account" : "I already have an account"}</button>
        {mode === "login" && <p className="muted small center">Demo: citizen@demo.test · staff@demo.test · super@demo.test<br />password: <code>password</code></p>}
      </main>
    </>
  );
}
