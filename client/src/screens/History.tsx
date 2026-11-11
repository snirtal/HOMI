import { monthFigures } from "../lib/expenses";
import { money, monthLabel, monthShort, netLabel } from "../lib/format";
import { useHousehold } from "../state/store";
import { Donut, MonthColumns } from "../components/Charts";
import { MonthSwitcher, memberName } from "../components/ui";

export function History() {
  const { state, members, positions, shiftMonth } = useHousehold();
  const monthExpenses = state.expenses.filter(
    (expense) => !expense.deleted && expense.billingYear === state.year && expense.billingMonth === state.month,
  );
  const figures = monthFigures(monthExpenses);
  const slices = state.categories
    .map((category) => ({
      id: category.id,
      label: category.name,
      color: category.color,
      value: monthExpenses
        .filter((expense) => expense.categoryId === category.id)
        .reduce((sum, expense) => sum + expense.amountAgorot, 0),
    }))
    .filter((slice) => slice.value > 0);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const value = state.expenses
      .filter((expense) => !expense.deleted && expense.billingYear === state.year && expense.billingMonth === month)
      .reduce((sum, expense) => sum + expense.amountAgorot, 0);
    return { key: String(month), label: monthShort(month), value, active: month === state.month };
  });
  const yearTotal = months.reduce((sum, month) => sum + month.value, 0);
  const maxCategory = Math.max(...slices.map((slice) => slice.value), 1);

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">History</p>
          <h1>{monthLabel(state.year, state.month)}</h1>
        </div>
        <MonthSwitcher
          label={monthLabel(state.year, state.month)}
          onPrevious={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </header>
      <p className="muted">Totals follow the billing month, not the day the money left the account.</p>

      <div className="history-grid">
        <article className="card chart-card">
          <h2>By category</h2>
          {slices.length === 0 ? (
            <p className="muted">No bills in this month.</p>
          ) : (
            <Donut slices={slices} caption={monthShort(state.month)} totalLabel={money(figures.total)} />
          )}
          <ul className="category-list">
            {slices.map((slice) => (
              <li key={slice.id}>
                <span className="swatch" style={{ background: slice.color }} />
                <span className="category-name">{slice.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(slice.value / maxCategory) * 100}%`, background: slice.color }} />
                </span>
                <strong>{money(slice.value)}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="card chart-card">
          <div className="section-head">
            <h2>{state.year} by month</h2>
            <strong>{money(yearTotal)}</strong>
          </div>
          <MonthColumns months={months} />
          <p className="muted">The highlighted bar is the month you are viewing.</p>
        </article>
      </div>

      <article className="card">
        <h2>By person</h2>
        <p className="muted">Share of money already paid in {monthLabel(state.year, state.month)}. Settlements stay on Balances.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Paid</th>
                <th>Share</th>
                <th>Month position</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={row.memberId}>
                  <td>{memberName(members, row.memberId)}</td>
                  <td>{money(row.paidAgorot)}</td>
                  <td>{money(row.shareOfPaidAgorot)}</td>
                  <td>{netLabel(row.netAgorot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
