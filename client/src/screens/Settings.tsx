import { useState } from "react";
import { bpsToInput } from "../lib/format";
import { useHousehold } from "../state/store";
import { Button, Field } from "../components/ui";

export function Settings() {
  const { state, renameHousehold, addCategory, saveDefaultSplit, reset, members } = useHousehold();
  const [name, setName] = useState(state.householdName);
  const [categoryName, setCategoryName] = useState("");
  const [alexPercent, setAlexPercent] = useState(bpsToInput(state.defaultAlexBps));
  const [jordanPercent, setJordanPercent] = useState(bpsToInput(10000 - state.defaultAlexBps));
  const [message, setMessage] = useState<string | null>(null);

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
        <h2>Members</h2>
        <ul className="plain-list">
          {members.map((member) => (
            <li key={member.id}>
              <span>
                <strong>{member.name}</strong>
                <span className="muted">{member.role}{member.name === "Alex" ? " · this preview" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">Invites and sign-in arrive with accounts. This preview already has Alex and Jordan.</p>
      </article>

      <article className="card settings-card">
        <h2>Categories</h2>
        <ul className="category-settings">
          {state.categories.map((category) => (
            <li key={category.id}>
              <span className="swatch" style={{ background: category.color }} />
              {category.name}
              {category.id === "bruno" ? <span className="muted">Dog</span> : null}
            </li>
          ))}
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
        <p className="muted">New expenses start here. Bills you already saved keep their own split.</p>
        <div className="form-grid two">
          <Field label="Alex %">
            <input value={alexPercent} onChange={(event) => setAlexPercent(event.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Jordan %">
            <input value={jordanPercent} onChange={(event) => setJordanPercent(event.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Button
          tone="secondary"
          onClick={() => setMessage(saveDefaultSplit(alexPercent, jordanPercent) ?? "Default split saved.")}
        >
          Save default split
        </Button>
      </article>

      <article className="card settings-card">
        <h2>Preferences</h2>
        <p>Currency is the Israeli shekel (ILS). Amounts show two decimal places.</p>
        <p className="muted">Changes in this preview stay in this browser tab.</p>
        {message ? (
          <p className={message === "Default split saved." ? "muted" : "form-error"}>{message}</p>
        ) : null}
        <Button tone="ghost" onClick={reset}>
          Reset preview data
        </Button>
      </article>
    </section>
  );
}
