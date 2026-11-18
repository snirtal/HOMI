import { parseShortcutImport, type ShortcutImport } from "@homi/shared";
import { useEffect, useRef, useState } from "react";
import { Shell } from "./components/Shell";
import { HouseholdProvider, useHousehold, type RemoteHome, type SharedSlice } from "./state/store";
import type { ExpensePrefill } from "./types";
import { Balances } from "./screens/Balances";
import { Dashboard } from "./screens/Dashboard";
import { ExpenseSheet } from "./screens/ExpenseSheet";
import { Expenses } from "./screens/Expenses";
import { History } from "./screens/History";
import { Plants } from "./screens/Plants";
import { Settings } from "./screens/Settings";
import { SettlementSheet } from "./screens/SettlementSheet";
import { TaskSheet } from "./screens/TaskSheet";
import { Tasks } from "./screens/Tasks";
import { api, loadSession, type AccountSession } from "./auth/api";
import { AuthScreen, CreateHome, JoinRequest } from "./auth/screens";

const PENDING_IMPORT_KEY = "homi.pendingExpenseImport";
const RECENT_IMPORT_KEY = "homi.recentExpenseImport";
const IMPORT_DEDUPE_MS = 60_000;
let shortcutImportCaptured = false;

export function App() {
  captureShortcutImport();
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
  const { state, openExpense } = useHousehold();
  const openExpenseRef = useRef(openExpense);
  openExpenseRef.current = openExpense;

  useEffect(() => {
    let active = true;
    const prefill = readPendingImport();
    if (!prefill) return;
    const timer = window.setTimeout(() => {
      if (!active) return;
      sessionStorage.removeItem(PENDING_IMPORT_KEY);
      openExpenseRef.current(null, prefill);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const titles: Record<typeof state.screen, string> = {
      dashboard: "Home",
      expenses: "Expenses",
      balances: "Balances",
      tasks: "Tasks",
      history: "History",
      settings: "Settings",
      plants: "Plants",
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
        {state.screen === "plants" && <Plants />}
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

function captureShortcutImport(): void {
  if (shortcutImportCaptured) return;
  shortcutImportCaptured = true;
  const parsed = parseShortcutImport(window.location.search);
  if (!parsed) return;
  stripImportParams();
  try {
    const now = Date.now();
    const recentRaw = sessionStorage.getItem(RECENT_IMPORT_KEY);
    if (recentRaw) {
      const recent = JSON.parse(recentRaw) as { fingerprint?: unknown; at?: unknown };
      if (
        recent.fingerprint === parsed.fingerprint &&
        typeof recent.at === "number" &&
        now - recent.at < IMPORT_DEDUPE_MS
      ) {
        return;
      }
    }
    sessionStorage.setItem(RECENT_IMPORT_KEY, JSON.stringify({ fingerprint: parsed.fingerprint, at: now }));
    sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(parsed));
  } catch {
    // The form still works when opened by hand. A blocked sessionStorage just skips the import.
  }
}

function stripImportParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("addExpense");
  url.searchParams.delete("amount");
  url.searchParams.delete("merchant");
  const search = url.searchParams.toString();
  window.history.replaceState(window.history.state, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
}

function readPendingImport(): ExpensePrefill | null {
  try {
    const raw = sessionStorage.getItem(PENDING_IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShortcutImport>;
    if (typeof parsed.title !== "string" || typeof parsed.amount !== "string") {
      sessionStorage.removeItem(PENDING_IMPORT_KEY);
      return null;
    }
    if (parsed.amount !== "" && !/^\d+(\.\d{1,2})?$/.test(parsed.amount)) {
      sessionStorage.removeItem(PENDING_IMPORT_KEY);
      return null;
    }
    return {
      title: [...parsed.title].slice(0, 80).join(""),
      amount: parsed.amount,
      amountInvalid: Boolean(parsed.amountInvalid),
    };
  } catch {
    return null;
  }
}

function inviteToken(path: string): string | null {
  const match = /^\/invite\/([^/?#]+)/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
