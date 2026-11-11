import { parseShekels, percentageShares } from "@homi/shared";
import { useEffect, useState } from "react";
import { ALEX_ID, JORDAN_ID } from "../types";
import { expensePaid, expenseStatus } from "../lib/expenses";
import { bpsToInput, formatDay, inputToBps, money, moneyPlain, monthName, todayISO } from "../lib/format";
import { useHousehold, type ExpenseDraft } from "../state/store";
import { Button, Field, Sheet, memberName } from "../components/ui";

export function ExpenseSheet() {
  const { state, closeExpense, saveExpense, deleteExpense, recordPayment, voidPayment, markPaid } = useHousehold();
  const existing =
    state.expenseEditor && state.expenseEditor !== "new"
      ? state.expenses.find((expense) => expense.id === state.expenseEditor && !expense.deleted)
      : undefined;
  const [draft, setDraft] = useState<ExpenseDraft>(() => buildDraft(state));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payerId, setPayerId] = useState(ALEX_ID);
  const [paidOn, setPaidOn] = useState(todayISO());

  useEffect(() => {
    setDraft(buildDraft(state));
    setError(null);
    setConfirmDelete(false);
    const current =
      state.expenseEditor && state.expenseEditor !== "new"
        ? state.expenses.find((expense) => expense.id === state.expenseEditor)
        : undefined;
    if (current) {
      const left = current.amountAgorot - expensePaid(current);
      setPayAmount(left > 0 ? moneyPlain(left) : "");
    } else {
      setPayAmount("");
    }
  }, [state.expenseEditor, state.defaultAlexBps]);

  if (!state.expenseEditor) return null;

  const preview = previewShares(draft);
  const activePayments = existing?.payments.filter((payment) => !payment.voided) ?? [];

  return (
    <Sheet title={existing ? "Edit expense" : "New expense"} onClose={closeExpense}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setError(saveExpense(draft));
        }}
      >
        <Field label="Title">
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </Field>
        <div className="form-grid two">
          <Field label="Amount (ILS)">
            <input
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.categoryId}
              onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
            >
              {state.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Billing month">
            <select
              value={draft.billingMonth}
              onChange={(event) => setDraft({ ...draft, billingMonth: Number(event.target.value) })}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {monthName(index + 1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing year">
            <select
              value={draft.billingYear}
              onChange={(event) => setDraft({ ...draft, billingYear: Number(event.target.value) })}
            >
              {[2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Due date">
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          />
        </Field>
        <Field label="Split">
          <div className="segment">
            <button
              type="button"
              className={draft.splitMode === "equal" ? "chip active" : "chip"}
              onClick={() => setDraft({ ...draft, splitMode: "equal", alexPercent: "50", jordanPercent: "50" })}
            >
              Equal
            </button>
            <button
              type="button"
              className={draft.splitMode === "percentage" ? "chip active" : "chip"}
              onClick={() => setDraft({ ...draft, splitMode: "percentage" })}
            >
              Custom
            </button>
          </div>
        </Field>
        {draft.splitMode === "percentage" ? (
          <div className="form-grid two">
            <Field label="Alex %">
              <input
                inputMode="decimal"
                value={draft.alexPercent}
                onChange={(event) => setDraft({ ...draft, alexPercent: event.target.value })}
              />
            </Field>
            <Field label="Jordan %">
              <input
                inputMode="decimal"
                value={draft.jordanPercent}
                onChange={(event) => setDraft({ ...draft, jordanPercent: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
        {preview ? <p className="split-preview">Alex {money(preview.alex)} · Jordan {money(preview.jordan)}</p> : null}
        <Field label="Notes">
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="sheet-actions">
          <Button type="submit">Save expense</Button>
          {existing ? (
            <Button
              tone="danger"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                deleteExpense(existing.id);
              }}
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          ) : null}
        </div>
      </form>

      {existing ? (
        <section className="payment-box">
          <h3>Payments</h3>
          <p className="muted">
            Status is {expenseStatus(existing)}. Recorded payments stay as entered. Void one to correct it.
          </p>
          {activePayments.length === 0 ? <p className="muted">No payment recorded.</p> : null}
          <ul className="plain-list">
            {activePayments.map((payment) => (
              <li key={payment.id}>
                <span>
                  {memberName(payment.memberId)} · {money(payment.amountAgorot)} · {formatDay(payment.paidOn)}
                </span>
                <button type="button" className="text-action" onClick={() => voidPayment(existing.id, payment.id)}>
                  Void
                </button>
              </li>
            ))}
          </ul>
          {expenseStatus(existing) !== "paid" ? (
            <div className="form-grid">
              <div className="form-grid two">
                <Field label="Payment amount">
                  <input value={payAmount} onChange={(event) => setPayAmount(event.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Paid by">
                  <select value={payerId} onChange={(event) => setPayerId(event.target.value)}>
                    <option value={ALEX_ID}>Alex</option>
                    <option value={JORDAN_ID}>Jordan</option>
                  </select>
                </Field>
              </div>
              <Field label="Payment date">
                <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
              </Field>
              <div className="sheet-actions">
                <Button
                  tone="secondary"
                  onClick={() => {
                    const message = recordPayment(existing.id, payAmount, payerId, paidOn);
                    setError(message);
                    if (!message) {
                      const left = existing.amountAgorot - expensePaid(existing);
                      setPayAmount(left > 0 ? moneyPlain(left) : "");
                    }
                  }}
                >
                  Record payment
                </Button>
                <Button tone="ghost" onClick={() => markPaid(existing.id, payerId)}>
                  Mark the rest paid
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}

function buildDraft(state: ReturnType<typeof useHousehold>["state"]): ExpenseDraft {
  const existing =
    state.expenseEditor && state.expenseEditor !== "new"
      ? state.expenses.find((expense) => expense.id === state.expenseEditor)
      : undefined;
  if (!existing) {
    const alex = state.defaultAlexBps;
    return {
      title: "",
      categoryId: state.categories[0]?.id ?? "groceries",
      amount: "",
      billingYear: state.year,
      billingMonth: state.month,
      dueDate: "",
      notes: "",
      splitMode: alex === 5000 ? "equal" : "percentage",
      alexPercent: bpsToInput(alex),
      jordanPercent: bpsToInput(10000 - alex),
    };
  }
  const alex = existing.splitBps.find((share) => share.memberId === ALEX_ID)?.shareBps ?? 5000;
  const jordan = existing.splitBps.find((share) => share.memberId === JORDAN_ID)?.shareBps ?? 5000;
  return {
    id: existing.id,
    title: existing.title,
    categoryId: existing.categoryId,
    amount: moneyPlain(existing.amountAgorot),
    billingYear: existing.billingYear,
    billingMonth: existing.billingMonth,
    dueDate: existing.dueDate ?? "",
    notes: existing.notes ?? "",
    splitMode: existing.splitMode,
    alexPercent: bpsToInput(alex),
    jordanPercent: bpsToInput(jordan),
  };
}

function previewShares(draft: ExpenseDraft): { alex: number; jordan: number } | null {
  try {
    const amount = parseShekels(draft.amount);
    if (amount <= 0) return null;
    const alexBps = draft.splitMode === "equal" ? 5000 : inputToBps(draft.alexPercent);
    const jordanBps = draft.splitMode === "equal" ? 5000 : inputToBps(draft.jordanPercent);
    if (alexBps === null || jordanBps === null) return null;
    const shares = percentageShares(amount, [
      { memberId: ALEX_ID, shareBps: alexBps },
      { memberId: JORDAN_ID, shareBps: jordanBps },
    ]);
    return {
      alex: shares.find((share) => share.memberId === ALEX_ID)?.shareAgorot ?? 0,
      jordan: shares.find((share) => share.memberId === JORDAN_ID)?.shareAgorot ?? 0,
    };
  } catch {
    return null;
  }
}
