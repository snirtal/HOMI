import { ALEX_ID } from "../types";
import { monthFigures } from "../lib/expenses";
import { formatDay, money, monthLabel, netLabel, youBalance } from "../lib/format";
import { useHousehold } from "../state/store";
import { Button, MonthSwitcher, memberName } from "../components/ui";

export function Balances() {
  const { state, positions, outstanding, shiftMonth, openSettlement, voidSettlement } = useHousehold();
  const you = outstanding.find((row) => row.memberId === ALEX_ID);
  const balance = youBalance(you?.netAgorot ?? 0, "Jordan");
  const monthExpenses = state.expenses.filter(
    (expense) => !expense.deleted && expense.billingYear === state.year && expense.billingMonth === state.month,
  );
  const figures = monthFigures(monthExpenses);
  const history = state.settlements.filter((settlement) => !settlement.voided);

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">Who owes whom</p>
          <h1>Balances</h1>
        </div>
        <Button onClick={openSettlement}>Record settlement</Button>
      </header>

      <article className="card balance-hero">
        <p className="eyebrow">Outstanding balance</p>
        <p className={`hero-value ${balance.tone}`}>{balance.title}</p>
        <p className="lede">{balance.detail}</p>
        <p className="muted">All months, after settlements. This is the debt that is still open.</p>
      </article>

      <div className="pair">
        <article className="card stat">
          <p className="eyebrow">Alex paid</p>
          <strong>{money(you?.paidAgorot ?? 0)}</strong>
          <p className="muted">Money sent to providers.</p>
        </article>
        <article className="card stat">
          <p className="eyebrow">Alex's share</p>
          <strong>{money(you?.shareOfPaidAgorot ?? 0)}</strong>
          <p className="muted">Share of bills that were actually paid.</p>
        </article>
      </div>

      <div className="table-wrap card">
        <h2>All-time detail</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Paid</th>
              <th>Share</th>
              <th>Sent</th>
              <th>Received</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {outstanding.map((row) => (
              <tr key={row.memberId}>
                <td>{row.memberId === ALEX_ID ? "Alex" : "Jordan"}</td>
                <td>{money(row.paidAgorot)}</td>
                <td>{money(row.shareOfPaidAgorot)}</td>
                <td>{money(row.settlementsSentAgorot)}</td>
                <td>{money(row.settlementsReceivedAgorot)}</td>
                <td>{netLabel(row.netAgorot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="card">
        <div className="section-head">
          <div>
            <h2>{monthLabel(state.year, state.month)} split</h2>
            <p className="muted">
              This month's bills only. Transfers are not included. Billed {money(figures.total)}.
            </p>
          </div>
          <MonthSwitcher
            label={monthLabel(state.year, state.month)}
            onPrevious={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
          />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Paid</th>
                <th>Share</th>
                <th>This month</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={row.memberId}>
                  <td>{row.memberId === ALEX_ID ? "Alex" : "Jordan"}</td>
                  <td>{money(row.paidAgorot)}</td>
                  <td>{money(row.shareOfPaidAgorot)}</td>
                  <td>{netLabel(row.netAgorot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Settlement history</h2>
        {history.length === 0 ? <p className="muted">No transfers yet.</p> : null}
        <ul className="plain-list">
          {history.map((settlement) => (
            <li key={settlement.id}>
              <span>
                <strong>
                  {memberName(settlement.fromMemberId)} paid {memberName(settlement.toMemberId)}{" "}
                  {money(settlement.amountAgorot)}
                </strong>
                <span className="muted">
                  {formatDay(settlement.settledOn)}
                  {settlement.note ? ` · ${settlement.note}` : ""}
                </span>
              </span>
              <button type="button" className="text-action" onClick={() => voidSettlement(settlement.id)}>
                Void
              </button>
            </li>
          ))}
        </ul>
      </article>
      <p className="fine-print">Alex is the person using this preview. Jordan is the other household member.</p>
    </section>
  );
}
