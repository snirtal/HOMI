import { useEffect, useState } from "react";
import { ALEX_ID, JORDAN_ID } from "../types";
import { todayISO } from "../lib/format";
import { useHousehold, type SettlementDraft } from "../state/store";
import { Button, Field, Sheet } from "../components/ui";

export function SettlementSheet() {
  const { state, closeSettlement, saveSettlement } = useHousehold();
  const [draft, setDraft] = useState<SettlementDraft>({
    fromMemberId: JORDAN_ID,
    toMemberId: ALEX_ID,
    amount: "",
    settledOn: todayISO(),
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.settlementEditor) return;
    setDraft({
      fromMemberId: JORDAN_ID,
      toMemberId: ALEX_ID,
      amount: "",
      settledOn: todayISO(),
      note: "",
    });
    setError(null);
  }, [state.settlementEditor]);

  if (!state.settlementEditor) return null;

  return (
    <Sheet title="Record settlement" onClose={closeSettlement}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setError(saveSettlement(draft));
        }}
      >
        <p className="muted">A settlement is money one person sends the other. It does not change the bills.</p>
        <Field label="From">
          <select value={draft.fromMemberId} onChange={(event) => setDraft({ ...draft, fromMemberId: event.target.value })}>
            <option value={ALEX_ID}>Alex</option>
            <option value={JORDAN_ID}>Jordan</option>
          </select>
        </Field>
        <Field label="To">
          <select value={draft.toMemberId} onChange={(event) => setDraft({ ...draft, toMemberId: event.target.value })}>
            <option value={ALEX_ID}>Alex</option>
            <option value={JORDAN_ID}>Jordan</option>
          </select>
        </Field>
        <Field label="Amount (ILS)">
          <input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={draft.settledOn} onChange={(event) => setDraft({ ...draft, settledOn: event.target.value })} />
        </Field>
        <Field label="Note">
          <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit">Save settlement</Button>
      </form>
    </Sheet>
  );
}
