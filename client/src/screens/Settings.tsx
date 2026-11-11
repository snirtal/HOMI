import { useEffect, useState } from "react";
import { bpsToInput } from "../lib/format";
import { useHousehold } from "../state/store";
import { Button, Field, memberName } from "../components/ui";
import { HouseholdAccess } from "../auth/HouseholdAccess";

const SAVED = new Set(["Default split saved.", "Category removed."]);

export function Settings({
  role,
  onLogout,
  onRefresh,
}: {
  role: "owner" | "member";
  onLogout: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { state, youId, renameHousehold, addCategory, deleteCategory, saveDefaultSplit, members } = useHousehold();
  const [name, setName] = useState(state.householdName);
  const [categoryName, setCategoryName] = useState("");
  const [alexPercent, setAlexPercent] = useState(bpsToInput(state.defaultAlexBps));
  const [jordanPercent, setJordanPercent] = useState(bpsToInput(10000 - state.defaultAlexBps));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const youName = memberName(members, youId);
  const other = members.find((member) => member.id !== youId);

  useEffect(() => {
    setName(state.householdName);
  }, [state.householdName]);

  useEffect(() => {
    setAlexPercent(bpsToInput(state.defaultAlexBps));
    setJordanPercent(bpsToInput(10000 - state.defaultAlexBps));
  }, [state.defaultAlexBps]);

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">Household</p>
          <h1>Settings</h1>
        </div>
      </header>

      <article className="card settings-card">
        <h2>Household name</h2>
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => renameHousehold(name)}
          />
        </Field>
      </article>

      <article className="card settings-card">
        <h2>People</h2>
        <ul className="plain-list">
          {members.map((member) => (
            <li key={member.id}>
              <span>
                <strong>{member.name}</strong>
                <span className="muted">
                  {member.role}
                  {member.id === youId ? " · you" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <HouseholdAccess role={role} onChanged={() => onRefresh().catch(() => undefined)} />
      </article>

      <article className="card settings-card">
        <h2>Categories</h2>
        <ul className="category-settings">
          {state.categories.map((category) => {
            const key = `category:${category.id}`;
            const fallback =
              state.categories.find((item) => item.id !== category.id && item.id === "other") ??
              state.categories.find((item) => item.id !== category.id);
            return (
              <li key={category.id}>
                <span className="category-label">
                  <span className="swatch" style={{ background: category.color }} />
                  <span>{category.name}</span>
                  {category.id === "bruno" ? <span className="muted">Dog</span> : null}
                </span>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    if (pending !== key) {
                      setPending(key);
                      setMessage(null);
                      return;
                    }
                    setMessage(deleteCategory(category.id) ?? "Category removed.");
                    setPending(null);
                  }}
                >
                  {pending === key ? "Confirm remove" : "Remove"}
                </button>
                {pending === key ? (
                  <p className="muted settings-note">
                    {fallback
                      ? `Expenses in this category move to ${fallback.name}.`
                      : "Keep at least one category."}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const error = addCategory(categoryName);
            setMessage(error);
            if (!error) setCategoryName("");
          }}
        >
          <input
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder="New category"
            aria-label="New category"
          />
          <Button type="submit" tone="secondary">
            Add
          </Button>
        </form>
      </article>

      <article className="card settings-card">
        <h2>Default split</h2>
        {other ? (
          <>
            <p className="muted">New expenses start here. Bills you already saved keep their own split.</p>
            <div className="form-grid two">
              <Field label={`${youName} %`}>
                <input value={alexPercent} onChange={(event) => setAlexPercent(event.target.value)} inputMode="decimal" />
              </Field>
              <Field label={`${other.name} %`}>
                <input value={jordanPercent} onChange={(event) => setJordanPercent(event.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <Button
              tone="secondary"
              onClick={() => setMessage(saveDefaultSplit(alexPercent, jordanPercent) ?? "Default split saved.")}
            >
              Save default split
            </Button>
          </>
        ) : (
          <p className="muted">Only you are in this household, so new bills belong to you.</p>
        )}
      </article>

      <article className="card settings-card">
        <h2>Preferences</h2>
        <p>Currency is the Israeli shekel (ILS). Amounts show two decimal places.</p>
        <p className="muted">Bills, tasks, and balances are shared with everyone in this home.</p>
        {message ? <p className={SAVED.has(message) ? "muted" : "form-error"}>{message}</p> : null}
        <Button tone="ghost" onClick={onLogout}>
          Log out
        </Button>
      </article>
    </section>
  );
}
