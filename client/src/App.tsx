import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { HouseholdProvider, useHousehold, type RemoteHome, type SharedSlice } from "./state/store";
import { Balances } from "./screens/Balances";
import { Dashboard } from "./screens/Dashboard";
import { ExpenseSheet } from "./screens/ExpenseSheet";
import { Expenses } from "./screens/Expenses";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { SettlementSheet } from "./screens/SettlementSheet";
import { TaskSheet } from "./screens/TaskSheet";
import { Tasks } from "./screens/Tasks";
import { api, loadSession, type AccountSession } from "./auth/api";
import { AuthScreen, CreateHome, JoinRequest } from "./auth/screens";

export function App() {
  const [session, setSession] = useState<AccountSession | null | undefined>(undefined);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [path, setPath] = useState(window.location.pathname);
  const [inviteName, setInviteName] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const token = inviteToken(path);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    loadSession()
      .then((body) => setSession(body.session))
      .catch(() => setSession(null));
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!token) {
      setInviteName(null);
      setInviteError(null);
      return;
    }
    api<{ householdName: string }>(`/api/invitations/preview?token=${encodeURIComponent(token)}`)
      .then((body) => {
        setInviteName(body.householdName);
        setInviteError(null);
      })
      .catch((error: Error) => {
        setInviteName(null);
        setInviteError(error.message);
      });
  }, [token]);

  function logout() {
    api("/api/logout", { method: "POST" })
      .then(() => setSession(null))
      .catch(() => setSession(null));
  }

  function refresh() {
    return loadSession().then((body) => setSession(body.session));
  }

  if (session === undefined) {
    return (
      <main className="auth-shell">
        <p className="muted">Loading Homi…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        {inviteError ? <p className="auth-banner">{inviteError}</p> : null}
        <AuthScreen
          mode={mode}
          invite={token && inviteName ? { token, householdName: inviteName } : null}
          onMode={setMode}
          onSession={setSession}
        />
      </>
    );
  }

  if (!session.household || !session.workspace || !session.viewerId || !session.role) {
    if (inviteError) {
      return (
        <main className="auth-shell">
          <section className="auth-card">
            <h1>Invitation unavailable</h1>
            <p className="form-error">{inviteError}</p>
            <button type="button" className="text-action" onClick={logout}>
              Log out
            </button>
          </section>
        </main>
      );
    }
    if (token || session.pendingRequest) {
      return (
        <JoinRequest
          token={token}
          householdName={inviteName ?? session.pendingRequest?.householdName ?? "this home"}
          pending={Boolean(session.pendingRequest)}
          onRequested={() => {
            refresh().catch(() => undefined);
          }}
          onLogout={logout}
        />
      );
    }
    return <CreateHome onSession={setSession} />;
  }

  const remote: RemoteHome = {
    viewerId: session.viewerId,
    members: session.members,
    householdName: session.workspace.householdName || session.household.name,
    categories: session.workspace.categories,
    expenses: session.workspace.expenses,
    settlements: session.workspace.settlements,
    tasks: session.workspace.tasks,
    defaultViewerBps: session.workspace.defaultViewerBps,
    onSave: (slice: SharedSlice) => api("/api/workspace", { method: "PUT", body: JSON.stringify(slice) }),
  };

  return (
    <HouseholdProvider remote={remote}>
      <Prototype role={session.role} onLogout={logout} onRefresh={refresh} />
    </HouseholdProvider>
  );
}

function Prototype({
  role,
  onLogout,
  onRefresh,
}: {
  role: "owner" | "member";
  onLogout: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { state } = useHousehold();

  useEffect(() => {
    const titles: Record<typeof state.screen, string> = {
      dashboard: "Home",
      expenses: "Expenses",
      balances: "Balances",
      tasks: "Tasks",
      history: "History",
      settings: "Settings",
    };
    document.title = `Homi · ${titles[state.screen]}`;
  }, [state.screen]);

  useEffect(() => {
    document.body.classList.toggle(
      "sheet-open",
      Boolean(state.expenseEditor || state.taskEditor || state.settlementEditor),
    );
  }, [state.expenseEditor, state.taskEditor, state.settlementEditor]);

  return (
    <div className="app">
      <Shell>
        {state.screen === "dashboard" && <Dashboard />}
        {state.screen === "expenses" && <Expenses />}
        {state.screen === "balances" && <Balances />}
        {state.screen === "tasks" && <Tasks />}
        {state.screen === "history" && <History />}
        {state.screen === "settings" && <Settings role={role} onLogout={onLogout} onRefresh={onRefresh} />}
      </Shell>
      <ExpenseSheet />
      <TaskSheet />
      <SettlementSheet />
      {state.notice ? (
        <div className="toast" role="status">
          {state.notice}
        </div>
      ) : null}
    </div>
  );
}

function inviteToken(path: string): string | null {
  const match = /^\/invite\/([^/?#]+)/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
