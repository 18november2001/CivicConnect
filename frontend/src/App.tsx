import { useEffect, useState } from "react";
import type { Role, ServiceRequest, User } from "./types";
import { Nav } from "./components/ui";
import { session } from "./services/http";
import Login from "./pages/Login";
import { MyRequests, SubmitRequest } from "./pages/Citizen";
import { Queue, RequestDetail } from "./pages/Staff";
import Dashboard from "./pages/Management";

const MENUS: Record<Role, { id: string; label: string }[]> = {
  Citizen: [{ id: "submit", label: "Submit" }, { id: "mine", label: "My Requests" }],
  Staff: [{ id: "queue", label: "Queue" }],
  Supervisor: [{ id: "queue", label: "Queue" }, { id: "dash", label: "Dashboard" }],
  Admin: [{ id: "queue", label: "Queue" }, { id: "dash", label: "Dashboard" }],
};
const HOME: Record<Role, string> = { Citizen: "mine", Staff: "queue", Supervisor: "dash", Admin: "dash" };

export default function App() {
  const [user, setUser] = useState<User | null>(() => session.user()), [view, setView] = useState(() => { const u = session.user(); return u ? HOME[u.role] : ""; });
  const [open, setOpen] = useState<ServiceRequest | null>(null);
  const logout = () => { session.clear(); setUser(null); setOpen(null); };
  useEffect(() => { window.addEventListener("cc:unauthorised", logout); return () => window.removeEventListener("cc:unauthorised", logout); }, []);
  if (!user) return <Login onLogin={u => { session.setUser(u); setUser(u); setView(HOME[u.role]); }} />;
  const go = (v: string) => { setOpen(null); setView(v); };
  const allowed = (id: string) => MENUS[user.role].some(m => m.id === id); // role guard: UI hides, backend enforces (NFR-001)
  return (
    <>
      <Nav user={user} items={MENUS[user.role]} view={view} onNav={go} onLogout={logout} />
      <main className="page">
        {view === "submit" && allowed(view) && <SubmitRequest user={user} onDone={() => go("mine")} />}
        {view === "mine" && allowed(view) && <MyRequests user={user} />}
        {view === "queue" && allowed(view) && (open ? <RequestDetail user={user} initial={open} onBack={() => setOpen(null)} /> : <Queue onOpen={setOpen} />)}
        {view === "dash" && allowed(view) && <Dashboard />}
      </main>
    </>
  );
}
