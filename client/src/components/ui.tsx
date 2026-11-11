import type { ButtonHTMLAttributes, ReactNode } from "react";
import { expensePaid, expenseStatus } from "../lib/expenses";
import { formatDay, money, percentLabel, todayISO } from "../lib/format";
import { MEMBERS, type Category, type Expense } from "../types";
import { CategoryIcon, IconCheck, IconChevron } from "./Icons";

export function MonthSwitcher({
  label,
  onPrevious,
  onNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="month-switch">
      <button type="button" className="icon-button" onClick={onPrevious} aria-label="Previous month">
        <IconChevron direction="left" size={18} />
      </button>
      <strong>{label}</strong>
      <button type="button" className="icon-button" onClick={onNext} aria-label="Next month">
        <IconChevron direction="right" size={18} />
      </button>
    </div>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size < 32 ? 11 : 13 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export function StatusPill({ expense }: { expense: Expense }) {
  const status = expenseStatus(expense);
  const today = todayISO();
  const overdue = status !== "paid" && Boolean(expense.dueDate && expense.dueDate < today);
  const label = overdue ? "Overdue" : status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid";
  const tone = overdue ? "overdue" : status;
  return <span className={`status ${tone}`}>{label}</span>;
}

export function CategoryMark({ category, size = 42 }: { category: Category; size?: number }) {
  return (
    <span
      className="mark"
      style={{
        width: size,
        height: size,
        color: category.color,
        background: `color-mix(in srgb, ${category.color} 16%, white)`,
      }}
    >
      <CategoryIcon id={category.id} size={size > 36 ? 20 : 16} />
    </span>
  );
}

export function memberName(id: string): string {
  return MEMBERS.find((member) => member.id === id)?.name ?? "Member";
}

export function payerSummary(expense: Expense): string {
  const status = expenseStatus(expense);
  const active = expense.payments.filter((payment) => !payment.voided);
  if (active.length === 0 || status === "unpaid") {
    return expense.dueDate ? `Due ${formatDay(expense.dueDate)}` : "No payment yet";
  }
  const names = [...new Set(active.map((payment) => memberName(payment.memberId)))];
  const latest = [...active].sort((a, b) => a.paidOn.localeCompare(b.paidOn)).at(-1);
  const when = latest ? formatDay(latest.paidOn) : "";
  const who = names.length === 1 ? names[0] : names.join(" and ");
  if (status === "partial") return `Partly paid by ${who}${when ? ` · ${when}` : ""}`;
  return `Paid by ${who}${when ? ` on ${when}` : ""}`;
}

export function splitSummary(expense: Expense): string {
  return expense.splitBps.map((share) => percentLabel(share.shareBps)).join(" / ");
}

export function ExpenseRow({
  expense,
  category,
  onOpen,
  onMarkPaid,
  onMarkUnpaid,
}: {
  expense: Expense;
  category: Category;
  onOpen: () => void;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
}) {
  const status = expenseStatus(expense);
  const paid = expensePaid(expense);
  return (
    <article className="expense">
      <button type="button" className="expense-open" onClick={onOpen}>
        <CategoryMark category={category} />
        <span className="expense-copy">
          <span className="expense-title">{expense.title}</span>
          <span className="muted">
            {category.name} · {splitSummary(expense)}
          </span>
          <span className="muted">{payerSummary(expense)}</span>
        </span>
        <span className="expense-side">
          <strong className="amount">{money(expense.amountAgorot)}</strong>
          <StatusPill expense={expense} />
          {status === "partial" ? <span className="muted tiny">Left {money(expense.amountAgorot - paid)}</span> : null}
        </span>
      </button>
      {status === "paid" ? (
        <button type="button" className="text-action" onClick={onMarkUnpaid}>
          Mark unpaid
        </button>
      ) : (
        <button type="button" className="text-action" onClick={onMarkPaid}>
          {status === "partial" ? "Pay the rest" : "Mark paid"}
        </button>
      )}
    </article>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <IconChevron direction="left" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Button({
  tone = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button type="button" className={`button ${tone}`} {...props} />;
}

export function PaidBar({ paid, total }: { paid: number; total: number }) {
  const ratio = total <= 0 ? 0 : Math.min(1, paid / total);
  return (
    <div className="paidbar">
      <div className="paidbar-top">
        <span>Paid {money(paid)}</span>
        <span>Unpaid {money(Math.max(0, total - paid))}</span>
      </div>
      <div className="paidbar-track" aria-hidden="true">
        <div className="paidbar-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <IconCheck size={20} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
