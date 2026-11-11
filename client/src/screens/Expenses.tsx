import { useMemo, useState } from "react";
import { monthLabel } from "../lib/format";
import { useHousehold } from "../state/store";
import { ExpenseRow, MonthSwitcher } from "../components/ui";

export function Expenses() {
  const { state, openExpense, markPaid, markUnpaid, shiftMonth } = useHousehold();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const categories = useMemo(
    () => new Map(state.categories.map((category) => [category.id, category])),
    [state.categories],
  );
  const expenses = state.expenses.filter((expense) => {
    if (expense.deleted || expense.billingYear !== state.year || expense.billingMonth !== state.month) return false;
    if (categoryId !== "all" && expense.categoryId !== categoryId) return false;
    if (query.trim() && !expense.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">Household bills</p>
          <h1>Expenses</h1>
        </div>
        <MonthSwitcher
          label={monthLabel(state.year, state.month)}
          onPrevious={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </header>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this month"
          aria-label="Search expenses"
        />
        <button type="button" className="button primary" onClick={() => openExpense(null)}>
          Add expense
        </button>
      </div>
      <div className="chips" role="tablist" aria-label="Categories">
        <button type="button" className={categoryId === "all" ? "chip active" : "chip"} onClick={() => setCategoryId("all")}>
          All
        </button>
        {state.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={categoryId === category.id ? "chip active" : "chip"}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      {expenses.length === 0 ? (
        <div className="card empty">
          <strong>No expenses here</strong>
          <p>Try another month or category, or add a bill to {monthLabel(state.year, state.month)}.</p>
        </div>
      ) : (
        <div className="stack">
          {expenses.map((expense) => {
            const category = categories.get(expense.categoryId);
            if (!category) return null;
            return (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                category={category}
                onOpen={() => openExpense(expense.id)}
                onMarkPaid={() => markPaid(expense.id)}
                onMarkUnpaid={() => markUnpaid(expense.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
