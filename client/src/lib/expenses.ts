import {
  activePaymentsTotal,
  monthlyExpensePositions,
  outstandingBalances,
  paymentStatus,
  percentageShares,
  type LedgerExpense,
  type MonthlyExpensePosition,
  type OutstandingBalance,
  type PaymentStatus,
} from "@homi/shared";
import { MEMBER_IDS, type Expense, type Settlement } from "../types";

export function toLedgerExpense(expense: Expense): LedgerExpense {
  const shares = percentageShares(expense.amountAgorot, expense.splitBps);
  return {
    id: expense.id,
    billingYear: expense.billingYear,
    billingMonth: expense.billingMonth,
    amountAgorot: expense.amountAgorot,
    splits: shares.map((share) => ({
      memberId: share.memberId,
      shareAgorot: share.shareAgorot,
    })),
    payments: expense.payments.map((payment) => ({
      memberId: payment.memberId,
      amountAgorot: payment.amountAgorot,
      ...(payment.voided ? { voided: true } : {}),
    })),
    ...(expense.deleted ? { deleted: true } : {}),
  };
}

export function toLedgerSettlement(settlement: Settlement) {
  return {
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amountAgorot: settlement.amountAgorot,
    ...(settlement.voided ? { voided: true } : {}),
  };
}

export function expensePaid(expense: Expense): number {
  return activePaymentsTotal(expense.payments);
}

export function expenseStatus(expense: Expense): PaymentStatus {
  return paymentStatus(expense.amountAgorot, expensePaid(expense));
}

export function activityDate(expense: Expense): string {
  const payment = [...expense.payments].reverse().find((item) => !item.voided);
  if (payment) return payment.paidOn;
  if (expense.dueDate) return expense.dueDate;
  return `${expense.billingYear}-${String(expense.billingMonth).padStart(2, "0")}-01`;
}

export function monthFigures(expenses: readonly Expense[]): { total: number; paid: number; unpaid: number } {
  const total = expenses.reduce((sum, expense) => sum + expense.amountAgorot, 0);
  const paid = expenses.reduce((sum, expense) => sum + expensePaid(expense), 0);
  return { total, paid, unpaid: total - paid };
}

export function positionsFor(
  expenses: readonly Expense[],
  year: number,
  month: number,
): MonthlyExpensePosition[] {
  return monthlyExpensePositions(
    expenses.map(toLedgerExpense),
    year,
    month,
    MEMBER_IDS,
  );
}

export function balancesFor(
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
): OutstandingBalance[] {
  return outstandingBalances(
    expenses.map(toLedgerExpense),
    settlements.map(toLedgerSettlement),
    MEMBER_IDS,
  );
}

export function sharesFor(expense: Expense) {
  return percentageShares(expense.amountAgorot, expense.splitBps);
}
