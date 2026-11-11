import { useEffect, useState } from "react";
import { todayISO } from "../lib/format";
import { useHousehold, type SettlementDraft } from "../state/store";
import { Button, Field, MemberOptions, Sheet } from "../components/ui";

export function SettlementSheet() {
  const { state, members, youId, closeSettlement, saveSettlement } = useHousehold();
  const other = members.find((member) => member.id !== youId);
  const [draft, setDraft] = useState<SettlementDraft>({
    fromMemberId: other?.id ?? youId,
    toMemberId: youId,
    amount: "",
    settledOn: todayISO(),
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.settlementEditor) return;
    setDraft({
      fromMemberId: other?.id ?? youId,
      toMemberId: youId,
      amount: "",
      settledOn: todayISO(),
      note: "",
    });
    setError(null);
  }, [state.settlementEditor, other?.id, youId]);

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
        {members.length < 2 ? (
          <p className="muted">Transfers need two people.</p>
        ) : (
          <>
            <p className="muted">A settlement is money one person sends the other. It does not change the bills.</p>
            <Field label="From">
              <select value={draft.fromMemberId} onChange={(event) => setDraft({ ...draft, fromMemberId: event.target.value })}>
                <MemberOptions />
              </select>
            </Field>
            <Field label="To">
              <select value={draft.toMemberId} onChange={(event) => setDraft({ ...draft, toMemberId: event.target.value })}>
                <MemberOptions />
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
          </>
        )}
      </form>
    </Sheet>
  );
}
