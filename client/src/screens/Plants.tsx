import { useEffect, useState } from "react";
import { api } from "../auth/api";
import { Button, Field } from "../components/ui";
import { formatDay, todayISO } from "../lib/format";
import { compressPlantPhoto, needsWater, wateringLabel, type Plant, type Watering } from "../lib/plants";

type Draft = {
  id: string | null;
  name: string;
  intervalDays: string;
  photo: string | null;
};

const emptyDraft = (): Draft => ({ id: null, name: "", intervalDays: "7", photo: null });

export function Plants() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Watering[] | null>(null);
  const today = todayISO();

  function load() {
    setLoading(true);
    return api<{ plants: Plant[] }>("/api/plants")
      .then((body) => {
        setPlants(body.plants);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void load();
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file || !draft) return;
    try {
      const photo = await compressPlantPhoto(file);
      setDraft({ ...draft, photo });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read that photo.");
    }
  }

  async function save() {
    if (!draft) return;
    const intervalDays = Number(draft.intervalDays);
    if (!draft.name.trim()) {
      setError("Name the plant.");
      return;
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      setError("Enter how many days between waterings.");
      return;
    }
    if (!draft.id && !draft.photo) {
      setError("Add a photo of the plant.");
      return;
    }
    setBusy(true);
    const body: { name: string; intervalDays: number; photo?: string } = {
      name: draft.name.trim(),
      intervalDays,
    };
    if (draft.photo) body.photo = draft.photo;
    try {
      if (draft.id) {
        await api(`/api/plants/${draft.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/plants", { method: "POST", body: JSON.stringify(body) });
      }
      setDraft(null);
      setError(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The plant could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function water(plant: Plant) {
    setBusy(true);
    try {
      const body = await api<{ plant: Plant }>(`/api/plants/${plant.id}/water`, { method: "POST" });
      setPlants((current) => current.map((item) => (item.id === plant.id ? body.plant : item)));
      if (historyFor === plant.id) {
        const listed = await api<{ waterings: Watering[] }>(`/api/plants/${plant.id}/waterings`);
        setHistory(listed.waterings);
      }
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The watering could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/api/plants/${id}`, { method: "DELETE" });
      setPendingDelete(null);
      if (historyFor === id) {
        setHistoryFor(null);
        setHistory(null);
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The plant could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(id: string) {
    if (historyFor === id) {
      setHistoryFor(null);
      setHistory(null);
      return;
    }
    setHistoryFor(id);
    setHistory(null);
    try {
      const body = await api<{ waterings: Watering[] }>(`/api/plants/${id}/waterings`);
      setHistory(body.waterings);
      setError(null);
    } catch (reason) {
      setHistory([]);
      setError(reason instanceof Error ? reason.message : "The watering history could not be loaded.");
    }
  }

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">Household</p>
          <h1>Plants</h1>
        </div>
        <Button tone="primary" onClick={() => { setDraft(emptyDraft()); setError(null); }} disabled={busy}>
          Add plant
        </Button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {draft ? (
        <article className="card plant-form">
          <h2>{draft.id ? "Edit plant" : "New plant"}</h2>
          <Field label="Name">
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} />
          </Field>
          <Field label="Days between waterings">
            <input
              inputMode="numeric"
              value={draft.intervalDays}
              onChange={(event) => setDraft({ ...draft, intervalDays: event.target.value })}
            />
          </Field>
          <Field label="Photo">
            <input
              className="plant-file"
              type="file"
              accept="image/*"
              onChange={(event) => void onPhoto(event.target.files?.[0])}
            />
          </Field>
          {draft.photo ? <img className="plant-preview" src={draft.photo} alt="" /> : null}
          <div className="sheet-actions">
            <Button tone="primary" onClick={() => void save()} disabled={busy}>
              Save
            </Button>
            <Button tone="secondary" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </article>
      ) : null}

      {loading ? <p className="muted">Loading plants…</p> : null}
      {!loading && !error && plants.length === 0 ? <p className="muted">No plants yet.</p> : null}

      <div className="stack">
        {plants.map((plant) => {
          const due = needsWater(plant, today);
          return (
            <article key={plant.id} className="card plant-card">
              <img className="plant-photo" src={plant.photo} alt="" />
              <div className="plant-copy">
                <h2>{plant.name}</h2>
                <p className="muted">Every {plant.intervalDays} {plant.intervalDays === 1 ? "day" : "days"}</p>
                <p className={due ? "plant-due" : "plant-ok"}>{wateringLabel(plant, today)}</p>
                <div className="plant-actions">
                  <Button tone="primary" onClick={() => void water(plant)} disabled={busy}>
                    Water
                  </Button>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setDraft({ id: plant.id, name: plant.name, intervalDays: String(plant.intervalDays), photo: plant.photo });
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                  {pendingDelete === plant.id ? (
                    <Button tone="danger" onClick={() => void remove(plant.id)} disabled={busy}>
                      Confirm delete
                    </Button>
                  ) : (
                    <Button tone="danger" onClick={() => setPendingDelete(plant.id)} disabled={busy}>
                      Delete
                    </Button>
                  )}
                  <Button tone="ghost" onClick={() => void toggleHistory(plant.id)} disabled={busy}>
                    {historyFor === plant.id ? "Hide history" : "History"}
                  </Button>
                </div>
                {historyFor === plant.id ? (
                  history === null ? (
                    <p className="muted">Loading history…</p>
                  ) : history.length === 0 ? (
                    <p className="muted">No waterings yet.</p>
                  ) : (
                    <ul className="plain-list plant-history">
                      {history.map((entry) => (
                        <li key={entry.id}>
                          <span>{formatDay(entry.wateredOn)}</span>
                          <span>{entry.memberName}</span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
