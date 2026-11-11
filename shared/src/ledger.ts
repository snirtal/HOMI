import { MoneyError, assertAgorot } from "./money.js";

export const SPLIT_BASIS_POINTS = 10_000;

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type Share = {
  memberId: string;
  shareBps: number;
  shareAgorot: number;
};

export type LedgerPayment = {
  memberId: string;
  amountAgorot: number;
  voided?: boolean;
};

export type LedgerExpense = {
  id: string;
  billingYear: number;
  billingMonth: number;
  amountAgorot: number;
  splits: readonly { memberId: string; shareAgorot: number }[];
  payments: readonly LedgerPayment[];
  deleted?: boolean;
};

export type LedgerSettlement = {
  fromMemberId: string;
  toMemberId: string;
  amountAgorot: number;
  voided?: boolean;
};

/** This month's bills only. Settlements are not included. */
export type MonthlyExpensePosition = {
  memberId: string;
  paidAgorot: number;
  shareOfPaidAgorot: number;
  netAgorot: number;
};

/** Running debt across every month. Settlements are included. */
export type OutstandingBalance = MonthlyExpensePosition & {
  settlementsSentAgorot: number;
  settlementsReceivedAgorot: number;
};

type Weight = { memberId: string; weight: number };

/**
 * Split a total into whole agorot.
 * The leftover agora goes to the largest fractional remainder.
 * A tie goes to the lowest member id.
 */
export function allocateAgorot(
  totalAgorot: number,
  weights: readonly Weight[],
): { memberId: string; amountAgorot: number }[] {
  assertAgorot(totalAgorot, { allowZero: true });
  if (weights.length === 0) {
    throw new MoneyError("empty_split", "A split needs at least one member.");
  }

  const seen = new Set<string>();
  let weightSum = 0n;
  const parts = weights.map((part) => {
    assertMemberId(part.memberId);
    if (seen.has(part.memberId)) {
      throw new MoneyError("duplicate_member", "A member can appear only once in a split.");
    }
    seen.add(part.memberId);
    if (!Number.isSafeInteger(part.weight) || part.weight < 0) {
      throw new MoneyError("invalid_amount", "A split weight must be a non-negative integer.");
    }
    const weight = BigInt(part.weight);
    weightSum += weight;
    return { memberId: part.memberId, weight };
  });

  if (weightSum === 0n) {
    if (totalAgorot === 0) {
      return parts.map((part) => ({ memberId: part.memberId, amountAgorot: 0 }));
    }
    throw new MoneyError("empty_split", "Split weights must be greater than zero.");
  }

  const total = BigInt(totalAgorot);
  const rows = parts.map((part) => {
    const product = total * part.weight;
    return {
      memberId: part.memberId,
      floor: product / weightSum,
      remainder: product % weightSum,
    };
  });

  let leftover = total - rows.reduce((sum, row) => sum + row.floor, 0n);
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return compareMemberId(left.memberId, right.memberId);
  });
  const bonus = new Map<string, bigint>();
  for (const row of ranked) {
    if (leftover === 0n) break;
    bonus.set(row.memberId, 1n);
    leftover -= 1n;
  }

  return rows.map((row) => ({
    memberId: row.memberId,
    amountAgorot: Number(row.floor + (bonus.get(row.memberId) ?? 0n)),
  }));
}

export function equalShares(amountAgorot: number, memberIds: readonly string[]): Share[] {
  assertAgorot(amountAgorot);
  if (memberIds.length === 0) {
    throw new MoneyError("empty_split", "A split needs at least one member.");
  }

  const ordered = [...memberIds].sort(compareMemberId);
  const seen = new Set<string>();
  for (const memberId of ordered) {
    assertMemberId(memberId);
    if (seen.has(memberId)) {
      throw new MoneyError("duplicate_member", "A member can appear only once in a split.");
    }
    seen.add(memberId);
  }

  const base = Math.floor(SPLIT_BASIS_POINTS / ordered.length);
  const leftover = SPLIT_BASIS_POINTS - base * ordered.length;
  return percentageShares(
    amountAgorot,
    ordered.map((memberId, index) => ({
      memberId,
      shareBps: base + (index < leftover ? 1 : 0),
    })),
  );
}

export function percentageShares(
  amountAgorot: number,
  splits: readonly { memberId: string; shareBps: number }[],
): Share[] {
  assertAgorot(amountAgorot);
  if (splits.length === 0) {
    throw new MoneyError("empty_split", "A split needs at least one member.");
  }

  let basisSum = 0;
  const seen = new Set<string>();
  for (const split of splits) {
    assertMemberId(split.memberId);
    if (seen.has(split.memberId)) {
      throw new MoneyError("duplicate_member", "A member can appear only once in a split.");
    }
    seen.add(split.memberId);
    if (
      !Number.isSafeInteger(split.shareBps) ||
      split.shareBps < 0 ||
      split.shareBps > SPLIT_BASIS_POINTS
    ) {
      throw new MoneyError(
        "invalid_percent",
        "Each share must be between 0% and 100%.",
      );
    }
    basisSum += split.shareBps;
  }
  if (basisSum !== SPLIT_BASIS_POINTS) {
    throw new MoneyError("percent_sum", "Split percentages must total 100%.");
  }

  const allocated = allocateAgorot(
    amountAgorot,
    splits.map((split) => ({ memberId: split.memberId, weight: split.shareBps })),
  );
  const amounts = new Map(allocated.map((row) => [row.memberId, row.amountAgorot]));
  return splits.map((split) => ({
    memberId: split.memberId,
    shareBps: split.shareBps,
    shareAgorot: amounts.get(split.memberId) ?? 0,
  }));
}

export function paymentStatus(
  amountAgorot: number,
  activePaymentsAgorot: number,
): PaymentStatus {
  assertAgorot(amountAgorot);
  assertAgorot(activePaymentsAgorot, { allowZero: true });
  if (activePaymentsAgorot > amountAgorot) {
    throw new MoneyError("exceeds_expense", "Payments cannot exceed the expense amount.");
  }
  if (activePaymentsAgorot === 0) return "unpaid";
  if (activePaymentsAgorot === amountAgorot) return "paid";
  return "partial";
}

export function activePaymentsTotal(payments: readonly LedgerPayment[]): number {
  return payments.reduce((sum, payment) => {
    if (payment.voided) return sum;
    assertAgorot(payment.amountAgorot);
    assertMemberId(payment.memberId);
    return sum + payment.amountAgorot;
  }, 0);
}

/**
 * Check a new expense amount against payments that already exist.
 * This never returns a rewritten payment.
 */
export function reviewAmountChange(
  activePaymentsAgorot: number,
  nextAmountAgorot: number,
): { ok: true; status: PaymentStatus } | { ok: false; code: "not_positive" | "below_payments" } {
  if (!Number.isSafeInteger(nextAmountAgorot) || nextAmountAgorot <= 0) {
    return { ok: false, code: "not_positive" };
  }
  assertAgorot(activePaymentsAgorot, { allowZero: true });
  if (nextAmountAgorot < activePaymentsAgorot) {
    return { ok: false, code: "below_payments" };
  }
  return { ok: true, status: paymentStatus(nextAmountAgorot, activePaymentsAgorot) };
}

/**
 * Check an explicit payment edit. Other payments stay as they are.
 */
export function reviewPaymentAmount(
  expenseAmountAgorot: number,
  otherActivePaymentsAgorot: number,
  nextPaymentAgorot: number,
): { ok: true; status: PaymentStatus } | { ok: false; code: "not_positive" | "exceeds_expense" } {
  assertAgorot(expenseAmountAgorot);
  assertAgorot(otherActivePaymentsAgorot, { allowZero: true });
  if (!Number.isSafeInteger(nextPaymentAgorot) || nextPaymentAgorot <= 0) {
    return { ok: false, code: "not_positive" };
  }
  if (otherActivePaymentsAgorot + nextPaymentAgorot > expenseAmountAgorot) {
    return { ok: false, code: "exceeds_expense" };
  }
  return {
    ok: true,
    status: paymentStatus(expenseAmountAgorot, otherActivePaymentsAgorot + nextPaymentAgorot),
  };
}

export function monthlyExpensePositions(
  expenses: readonly LedgerExpense[],
  billingYear: number,
  billingMonth: number,
  memberIds: readonly string[] = [],
): MonthlyExpensePosition[] {
  assertBillingPeriod(billingYear, billingMonth);
  const included = expenses.filter(
    (expense) =>
      !expense.deleted &&
      expense.billingYear === billingYear &&
      expense.billingMonth === billingMonth,
  );
  return toMonthlyPositions(accumulateExpenses(included, memberIds));
}

export function outstandingBalances(
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[],
  memberIds: readonly string[] = [],
): OutstandingBalance[] {
  const totals = accumulateExpenses(
    expenses.filter((expense) => !expense.deleted),
    memberIds,
  );

  for (const settlement of settlements) {
    if (settlement.voided) continue;
    assertMemberId(settlement.fromMemberId);
    assertMemberId(settlement.toMemberId);
    if (settlement.fromMemberId === settlement.toMemberId) {
      throw new MoneyError("invalid_member", "A settlement needs two different members.");
    }
    assertAgorot(settlement.amountAgorot);
    ensureMember(totals, settlement.fromMemberId);
    ensureMember(totals, settlement.toMemberId);
    const sender = totals.get(settlement.fromMemberId);
    const receiver = totals.get(settlement.toMemberId);
    if (!sender || !receiver) continue;
    sender.sent += settlement.amountAgorot;
    receiver.received += settlement.amountAgorot;
  }

  return [...totals.values()]
    .map((row) => ({
      memberId: row.memberId,
      paidAgorot: row.paid,
      shareOfPaidAgorot: row.share,
      settlementsSentAgorot: row.sent,
      settlementsReceivedAgorot: row.received,
      netAgorot: row.paid - row.share - row.received + row.sent,
    }))
    .sort((left, right) => compareMemberId(left.memberId, right.memberId));
}

type MemberTotals = {
  memberId: string;
  paid: number;
  share: number;
  sent: number;
  received: number;
};

function accumulateExpenses(
  expenses: readonly LedgerExpense[],
  memberIds: readonly string[],
): Map<string, MemberTotals> {
  const totals = new Map<string, MemberTotals>();
  for (const memberId of memberIds) {
    assertMemberId(memberId);
    ensureMember(totals, memberId);
  }

  for (const expense of expenses) {
    assertExpense(expense);
    for (const split of expense.splits) ensureMember(totals, split.memberId);

    const active = expense.payments.filter((payment) => !payment.voided);
    let paidTotal = 0;
    for (const payment of active) {
      assertAgorot(payment.amountAgorot);
      assertMemberId(payment.memberId);
      ensureMember(totals, payment.memberId);
      const row = totals.get(payment.memberId);
      if (!row) continue;
      row.paid += payment.amountAgorot;
      paidTotal += payment.amountAgorot;
    }
    if (paidTotal > expense.amountAgorot) {
      throw new MoneyError("exceeds_expense", "Payments cannot exceed the expense amount.");
    }
    if (paidTotal === 0) continue;

    const allocated = allocateAgorot(
      paidTotal,
      expense.splits.map((split) => ({
        memberId: split.memberId,
        weight: split.shareAgorot,
      })),
    );
    for (const share of allocated) {
      const row = totals.get(share.memberId);
      if (!row) continue;
      row.share += share.amountAgorot;
    }
  }

  return totals;
}

function toMonthlyPositions(totals: Map<string, MemberTotals>): MonthlyExpensePosition[] {
  return [...totals.values()]
    .map((row) => ({
      memberId: row.memberId,
      paidAgorot: row.paid,
      shareOfPaidAgorot: row.share,
      netAgorot: row.paid - row.share,
    }))
    .sort((left, right) => compareMemberId(left.memberId, right.memberId));
}

function assertExpense(expense: LedgerExpense): void {
  assertBillingPeriod(expense.billingYear, expense.billingMonth);
  assertAgorot(expense.amountAgorot);
  if (expense.splits.length === 0) {
    throw new MoneyError("empty_split", "An expense needs a saved split.");
  }

  const seen = new Set<string>();
  let shareSum = 0;
  for (const split of expense.splits) {
    assertMemberId(split.memberId);
    if (seen.has(split.memberId)) {
      throw new MoneyError("duplicate_member", "A member can appear only once in a split.");
    }
    seen.add(split.memberId);
    assertAgorot(split.shareAgorot, { allowZero: true });
    shareSum += split.shareAgorot;
  }
  if (shareSum !== expense.amountAgorot) {
    throw new MoneyError("split_mismatch", "Saved shares must add up to the expense amount.");
  }
}

function assertBillingPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 2200) {
    throw new MoneyError("invalid_period", "Choose a valid billing year.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new MoneyError("invalid_period", "Choose a billing month from 1 to 12.");
  }
}

function assertMemberId(memberId: string): void {
  if (memberId.trim().length === 0) {
    throw new MoneyError("invalid_member", "Member id is required.");
  }
}

function ensureMember(totals: Map<string, MemberTotals>, memberId: string): void {
  if (totals.has(memberId)) return;
  totals.set(memberId, { memberId, paid: 0, share: 0, sent: 0, received: 0 });
}

function compareMemberId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
