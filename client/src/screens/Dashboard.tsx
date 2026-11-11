import { activityDate, expenseStatus, monthFigures } from "../lib/expenses";
import { formatDay, greeting, money, monthLabel, netLabel, todayISO, youBalance } from "../lib/format";
import { useHousehold } from "../state/store";
import { IconBalances, IconPlus, IconTasks } from "../components/Icons";
import { ExpenseRow, MonthSwitcher, PaidBar, memberName } from "../components/ui";

export function Dashboard() {
  const { state, members, youId, positions, outstanding, openExpense, openTask, go, markPaid, markUnpaid, shiftMonth, toggleTask } =
    useHousehold();
  const categories = new Map(state.categories.map((category) => [category.id, category]));
  const monthExpenses = state.expenses
    .filter((expense) => !expense.deleted && expense.billingYear === state.year && expense.billingMonth === state.month)
    .sort((left, right) => activityDate(right).localeCompare(activityDate(left)));
  const figures = monthFigures(monthExpenses);
  const you = outstanding.find((row) => row.memberId === youId);
  const other = members.find((member) => member.id !== youId);
  const balance = other
    ? youBalance(you?.netAgorot ?? 0, other.name)
    : { title: money(Math.abs(you?.netAgorot ?? 0)), detail: "Only you are in this household", tone: "zero" as const };
  const today = todayISO();
  const attention = [...state.expenses]
    .filter((expense) => !expense.deleted && expense.billingYear === state.year && expense.billingMonth === state.month)
    .filter((expense) => expense.dueDate && expenseStatus(expense) !== "paid")
    .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))[0];
  const openTasks = state.tasks.filter((task) => !task.deleted && task.status === "open");
  const attentionLeft = attention
    ? attention.amountAgorot - attention.payments.filter((payment) => !payment.voided).reduce((sum, payment) => sum + payment.amountAgorot, 0)
    : 0;

  return (
    <section className="screen dash">
      <header className="page-head block-head">
        <div>
          <p className="eyebrow">Monthly overview</p>
          <h1>{monthLabel(state.year, state.month)}</h1>
        </div>
        <MonthSwitcher
          label={monthLabel(state.year, state.month)}
          onPrevious={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </header>

      <article className="card hero block-hero">
        <p className="eyebrow">Billed this month</p>
        <p className="hero-value">{money(figures.total)}</p>
        <p className="muted">Every household bill in {monthLabel(state.year, state.month)}, paid and unpaid.</p>
      </article>

      <article className="card block-bar">
        <PaidBar paid={figures.paid} total={figures.total} />
      </article>

      <article className="feature block-feature">
        <p className="eyebrow light">
          {attention?.dueDate && attention.dueDate < today ? "Overdue bill" : "Coming up"}
        </p>
        {attention?.dueDate ? (
          <>
            <h2>{attention.title}</h2>
            <p className="feature-amount">{money(attentionLeft)}</p>
            <p>
              Due {formatDay(attention.dueDate)} · {categories.get(attention.categoryId)?.name}
            </p>
            <button type="button" className="button light" onClick={() => markPaid(attention.id)}>
              Mark paid
            </button>
          </>
        ) : (
          <>
            <h2>Nothing due</h2>
            <p>Bills for this month are paid, or they do not have a due date yet.</p>
          </>
        )}
      </article>

      <div className="actions block-actions">
        <button type="button" className="action" onClick={() => openExpense(null)}>
          <IconPlus size={18} /> Expense
        </button>
        <button type="button" className="action" onClick={() => openTask(null)}>
          <IconTasks size={18} /> Task
        </button>
        <button type="button" className="action" onClick={() => go("expenses")}>
          <IconPlus size={18} /> Payment
        </button>
        <button type="button" className="action" onClick={() => go("balances")}>
          <IconBalances size={18} /> Balances
        </button>
      </div>

      <article className="card block-outstanding">
        <p className="eyebrow">Outstanding balance</p>
        <p className={`balance-figure ${balance.tone}`}>{balance.title}</p>
        <p className="muted">{balance.detail}. This includes every month and every settlement.</p>
        <div className="mini-nets">
          {positions.map((row) => (
            <span key={row.memberId}>
              {row.memberId === youId ? "You" : memberName(members, row.memberId)} · {netLabel(row.netAgorot)} this month
            </span>
          ))}
        </div>
      </article>

      <article className="card block-recent">
        <div className="section-head">
          <h2>Recent expenses</h2>
          <button type="button" className="text-action" onClick={() => go("expenses")}>
            View all
          </button>
        </div>
        {monthExpenses.length === 0 ? (
          <p className="muted">No expenses in this month yet.</p>
        ) : (
          <div className="stack">
            {monthExpenses.slice(0, 4).map((expense) => {
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
      </article>

      <article className="card block-tasks">
        <div className="section-head">
          <h2>{greeting()}</h2>
          <button type="button" className="text-action" onClick={() => go("tasks")}>
            Tasks
          </button>
        </div>
        <p className="muted">{openTasks.length} open around the house.</p>
        <div className="stack">
          {openTasks.slice(0, 3).map((task) => (
            <button key={task.id} type="button" className="task-line" onClick={() => toggleTask(task.id)}>
              <span className="check" aria-hidden="true" />
              <span>
                <strong>{task.title}</strong>
                <span className="muted">
                  {memberName(members, task.assignedMemberId)} ·{" "}
                  {task.dueDate < today ? "Overdue" : formatDay(task.dueDate)}
                </span>
              </span>
              <span className={task.dueDate < today ? "dot overdue" : "dot"} />
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}
