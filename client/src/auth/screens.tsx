import { useState, type FormEvent } from "react";
import { Button, Field } from "../components/ui";
import { api, type AccountSession } from "./api";

type Mode = "login" | "signup";

export function AuthScreen({
  mode,
  invite,
  onMode,
  onSession,
}: {
  mode: Mode;
  invite: { token: string; householdName: string } | null;
  onMode: (mode: Mode) => void;
  onSession: (session: AccountSession) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (mode === "signup" && !firstName.trim()) {
      setError("Enter your first name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const path = mode === "signup" ? "/api/signup" : "/api/login";
    const payload = mode === "signup" ? { firstName, email: cleanEmail, password } : { email: cleanEmail, password };
    api<{ session: AccountSession }>(path, { method: "POST", body: JSON.stringify(payload) })
      .then((body) => onSession(body.session))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(false));
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">
            <img src="/homi-logo-header.png" alt="" />
          </span>
          <span>
            <strong>Homi</strong>
            <small>Household</small>
          </span>
        </div>
        <div>
          <p className="eyebrow">{mode === "signup" ? "Create account" : "Welcome back"}</p>
          <h1>{mode === "signup" ? "Sign up" : "Log in"}</h1>
        </div>
        {invite ? <p className="muted">You are joining {invite.householdName}. Sign in, then ask the owner to approve you.</p> : null}
        {mode === "signup" ? (
          <Field label="First name">
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
          </Field>
        ) : null}
        <Field label="Email">
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" />
        </Field>
        <Field label="Password">
          <div className="password-row">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <button type="button" className="text-action password-toggle" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {mode === "signup" ? "Create account" : "Log in"}
        </Button>
        <button type="button" className="text-action" onClick={() => onMode(mode === "signup" ? "login" : "signup")}>
          {mode === "signup" ? "I already have an account" : "Create an account"}
        </button>
      </form>
    </main>
  );
}

export function CreateHome({ onSession }: { onSession: (session: AccountSession) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="auth-shell">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError("Name the household.");
            return;
          }
          api<{ session: AccountSession }>("/api/households", { method: "POST", body: JSON.stringify({ name }) })
            .then((body) => onSession(body.session))
            .catch((reason: Error) => setError(reason.message));
        }}
      >
        <p className="eyebrow">Your home</p>
        <h1>Create a household</h1>
        <p className="muted">You will be the owner. You can invite someone after this.</p>
        <Field label="Household name">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit">Create home</Button>
      </form>
    </main>
  );
}

export function JoinRequest({
  token,
  householdName,
  pending,
  onRequested,
  onLogout,
}: {
  token: string | null;
  householdName: string;
  pending: boolean;
  onRequested: () => void;
  onLogout: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Invitation</p>
        <h1>{pending ? "Waiting for approval" : `Join ${householdName}`}</h1>
        <p className="muted">
          {pending
            ? `Your request to join ${householdName} is with the owner. Nothing is shared until they approve it.`
            : "Asking to join does not open the home. The owner still has to approve you."}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        {pending ? (
          <Button onClick={onRequested}>Refresh</Button>
        ) : (
          <Button
            onClick={() => {
              if (!token) return;
              api("/api/join-requests", { method: "POST", body: JSON.stringify({ token }) })
                .then(onRequested)
                .catch((reason: Error) => setError(reason.message));
            }}
          >
            Ask to join
          </Button>
        )}
        <button type="button" className="text-action" onClick={onLogout}>
          Log out
        </button>
      </section>
    </main>
  );
}
