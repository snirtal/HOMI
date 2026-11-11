import { describe, expect, it } from "vitest";
import {
  activePaymentsTotal,
  equalShares,
  monthlyExpensePositions,
  outstandingBalances,
  paymentStatus,
  percentageShares,
  reviewAmountChange,
  reviewPaymentAmount,
  type LedgerExpense,
  type LedgerSettlement,
} from "./ledger.js";
import { MoneyError } from "./money.js";

const memberA = "member-a";
const memberB = "member-b";
const memberC = "member-c";

function expense(overrides: Partial<LedgerExpense> & Pick<LedgerExpense, "id" | "amountAgorot" | "splits">): LedgerExpense {
  return {
    billingYear: 2026,
    billingMonth: 11,
    payments: [],
    ...overrides,
  };
}

describe("splits", () => {
  it("splits an even amount equally", () => {
    expect(equalShares(60_000, [memberB, memberA])).toEqual([
      { memberId: memberA, shareBps: 5_000, shareAgorot: 30_000 },
      { memberId: memberB, shareBps: 5_000, shareAgorot: 30_000 },
    ]);
  });

  it("gives leftover agorot to the lowest member id", () => {
    expect(equalShares(10_000, [memberC, memberA, memberB])).toEqual([
      { memberId: memberA, shareBps: 3_334, shareAgorot: 3_334 },
      { memberId: memberB, shareBps: 3_333, shareAgorot: 3_333 },
      { memberId: memberC, shareBps: 3_333, shareAgorot: 3_333 },
    ]);
  });

  it("accepts 70/30 and 100/0 percentages", () => {
    expect(
      percentageShares(10_000, [
        { memberId: memberA, shareBps: 7_000 },
        { memberId: memberB, shareBps: 3_000 },
      ]).map((share) => share.shareAgorot),
    ).toEqual([7_000, 3_000]);

    expect(
      percentageShares(20_000, [
        { memberId: memberA, shareBps: 10_000 },
        { memberId: memberB, shareBps: 0 },
      ]).map((share) => share.shareAgorot),
    ).toEqual([20_000, 0]);
  });

  it("rejects percentages that do not total 100%", () => {
    expect(() =>
      percentageShares(10_000, [
        { memberId: memberA, shareBps: 6_000 },
        { memberId: memberB, shareBps: 3_000 },
      ]),
    ).toThrow(MoneyError);
  });
});

describe("payment integrity", () => {
  it("derives paid, partial, and unpaid from payment rows", () => {
    expect(paymentStatus(40_000, 0)).toBe("unpaid");
    expect(paymentStatus(40_000, 15_000)).toBe("partial");
    expect(paymentStatus(40_000, 40_000)).toBe("paid");
  });

  it("keeps a recorded payment when the bill grows", () => {
    const recorded = 40_000;
    const review = reviewAmountChange(recorded, 50_000);
    expect(review).toEqual({ ok: true, status: "partial" });
    expect(recorded).toBe(40_000);
  });

  it("rejects a bill that would fall below money already paid", () => {
    expect(reviewAmountChange(40_000, 30_000)).toEqual({
      ok: false,
      code: "below_payments",
    });
  });

  it("allows a smaller bill that still covers the recorded payments", () => {
    expect(reviewAmountChange(25_000, 30_000)).toEqual({ ok: true, status: "partial" });
  });

  it("checks an explicit payment correction against the other payments", () => {
    expect(reviewPaymentAmount(40_000, 10_000, 30_000)).toEqual({
      ok: true,
      status: "paid",
    });
    expect(reviewPaymentAmount(40_000, 10_000, 31_000)).toEqual({
      ok: false,
      code: "exceeds_expense",
    });
  });

  it("ignores a voided payment in the active total", () => {
    expect(
      activePaymentsTotal([
        { memberId: memberA, amountAgorot: 10_000, voided: true },
        { memberId: memberA, amountAgorot: 25_000 },
      ]),
    ).toBe(25_000);
  });
});

describe("monthly positions and outstanding balances", () => {
  const groceries = expense({
    id: "groceries",
    amountAgorot: 60_000,
    billingMonth: 11,
    splits: equalShares(60_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
      memberId,
      shareAgorot,
    })),
    payments: [{ memberId: memberA, amountAgorot: 60_000 }],
  });
  const bruno = expense({
    id: "bruno",
    amountAgorot: 20_000,
    billingMonth: 11,
    splits: equalShares(20_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
      memberId,
      shareAgorot,
    })),
    payments: [{ memberId: memberB, amountAgorot: 20_000 }],
  });
  const settlement: LedgerSettlement = {
    fromMemberId: memberB,
    toMemberId: memberA,
    amountAgorot: 20_000,
  };

  it("matches the 600 and 200 example before settlement", () => {
    const balances = outstandingBalances([groceries, bruno], [], [memberA, memberB]);
    expect(balances).toEqual([
      balance(memberA, { paid: 60_000, share: 40_000, net: 20_000 }),
      balance(memberB, { paid: 20_000, share: 40_000, net: -20_000 }),
    ]);
    expect(balances.reduce((sum, row) => sum + row.netAgorot, 0)).toBe(0);
  });

  it("keeps the settlement after both nets return to zero", () => {
    const balances = outstandingBalances([groceries, bruno], [settlement], [memberA, memberB]);
    expect(balances.map((row) => row.netAgorot)).toEqual([0, 0]);
    expect(balances[1]?.settlementsSentAgorot).toBe(20_000);
  });

  it("shows the month split without applying settlements", () => {
    const november = monthlyExpensePositions([groceries, bruno], 2026, 11, [memberA, memberB]);
    expect(november).toEqual([
      { memberId: memberA, paidAgorot: 60_000, shareOfPaidAgorot: 40_000, netAgorot: 20_000 },
      { memberId: memberB, paidAgorot: 20_000, shareOfPaidAgorot: 40_000, netAgorot: -20_000 },
    ]);
  });

  it("keeps an October bill in October when it was paid later", () => {
    const octoberBill = expense({
      id: "electricity",
      amountAgorot: 40_000,
      billingMonth: 10,
      splits: equalShares(40_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
        memberId,
        shareAgorot,
      })),
      payments: [{ memberId: memberA, amountAgorot: 40_000 }],
    });

    expect(monthlyExpensePositions([octoberBill], 2026, 10, [memberA, memberB])[0]?.paidAgorot).toBe(
      40_000,
    );
    expect(monthlyExpensePositions([octoberBill], 2026, 11, [memberA, memberB])).toEqual([
      { memberId: memberA, paidAgorot: 0, shareOfPaidAgorot: 0, netAgorot: 0 },
      { memberId: memberB, paidAgorot: 0, shareOfPaidAgorot: 0, netAgorot: 0 },
    ]);
  });

  it("leaves an unpaid bill out of member debt", () => {
    const unpaid = expense({
      id: "water",
      amountAgorot: 15_000,
      splits: equalShares(15_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
        memberId,
        shareAgorot,
      })),
    });
    expect(outstandingBalances([unpaid], [], [memberA, memberB]).map((row) => row.netAgorot)).toEqual([
      0, 0,
    ]);
  });

  it("shares only the paid portion of a partial bill", () => {
    const partial = expense({
      id: "committee",
      amountAgorot: 40_000,
      splits: equalShares(40_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
        memberId,
        shareAgorot,
      })),
      payments: [{ memberId: memberA, amountAgorot: 20_000 }],
    });
    expect(outstandingBalances([partial], [], [memberA, memberB])).toEqual([
      balance(memberA, { paid: 20_000, share: 10_000, net: 10_000 }),
      balance(memberB, { paid: 0, share: 10_000, net: -10_000 }),
    ]);
  });

  it("drops a deleted bill and a voided settlement from the outstanding balance", () => {
    const deleted = { ...groceries, deleted: true };
    const voided: LedgerSettlement = { ...settlement, voided: true };
    const balances = outstandingBalances([deleted, bruno], [voided], [memberA, memberB]);
    expect(balances).toEqual([
      balance(memberA, { paid: 0, share: 10_000, net: -10_000 }),
      balance(memberB, { paid: 20_000, share: 10_000, net: 10_000 }),
    ]);
  });

  it("recalculates debt after a historical split change and keeps the settlement", () => {
    const groceriesAllOnA = expense({
      id: "groceries",
      amountAgorot: 60_000,
      splits: percentageShares(60_000, [
        { memberId: memberA, shareBps: 10_000 },
        { memberId: memberB, shareBps: 0 },
      ]).map(({ memberId, shareAgorot }) => ({ memberId, shareAgorot })),
      payments: [{ memberId: memberA, amountAgorot: 60_000 }],
    });

    const balances = outstandingBalances(
      [groceriesAllOnA, bruno],
      [settlement],
      [memberA, memberB],
    );
    expect(balances.map((row) => [row.memberId, row.netAgorot, row.settlementsSentAgorot])).toEqual([
      [memberA, -30_000, 0],
      [memberB, 30_000, 20_000],
    ]);
  });

  it("does not create debt for the unpaid increase when a payment stays put", () => {
    const raised = expense({
      id: "groceries",
      amountAgorot: 90_000,
      splits: equalShares(90_000, [memberA, memberB]).map(({ memberId, shareAgorot }) => ({
        memberId,
        shareAgorot,
      })),
      payments: [{ memberId: memberA, amountAgorot: 60_000 }],
    });
    const review = reviewAmountChange(60_000, 90_000);
    expect(review).toEqual({ ok: true, status: "partial" });

    const balances = outstandingBalances([raised, bruno], [settlement], [memberA, memberB]);
    expect(balances.map((row) => row.netAgorot)).toEqual([0, 0]);
  });

  it("charges the share to the other member when someone else paid their part", () => {
    const paidByBForA = expense({
      id: "rent",
      amountAgorot: 50_000,
      splits: percentageShares(50_000, [
        { memberId: memberA, shareBps: 10_000 },
        { memberId: memberB, shareBps: 0 },
      ]).map(({ memberId, shareAgorot }) => ({ memberId, shareAgorot })),
      payments: [{ memberId: memberB, amountAgorot: 50_000 }],
    });
    expect(outstandingBalances([paidByBForA], [], [memberA, memberB]).map((row) => row.netAgorot)).toEqual([
      -50_000, 50_000,
    ]);
  });

  it("can reverse a debt when a settlement is larger than the current balance", () => {
    const balances = outstandingBalances([groceries, bruno], [
      { ...settlement, amountAgorot: 25_000 },
    ]);
    expect(balances.map((row) => row.netAgorot)).toEqual([-5_000, 5_000]);
  });

  it("leaves September empty when the missing bill has not been added", () => {
    expect(monthlyExpensePositions([groceries], 2026, 9, [memberA, memberB]).map((row) => row.netAgorot)).toEqual([
      0, 0,
    ]);
  });

  it("rejects saved shares that do not add up to the bill", () => {
    const broken = expense({
      id: "broken",
      amountAgorot: 10_000,
      splits: [
        { memberId: memberA, shareAgorot: 4_000 },
        { memberId: memberB, shareAgorot: 4_000 },
      ],
    });
    expect(() => outstandingBalances([broken], [])).toThrow(MoneyError);
  });
});

function balance(
  memberId: string,
  amounts: { paid: number; share: number; net: number; sent?: number; received?: number },
) {
  return {
    memberId,
    paidAgorot: amounts.paid,
    shareOfPaidAgorot: amounts.share,
    settlementsSentAgorot: amounts.sent ?? 0,
    settlementsReceivedAgorot: amounts.received ?? 0,
    netAgorot: amounts.net,
  };
}
