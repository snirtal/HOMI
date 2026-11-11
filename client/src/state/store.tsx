import {
  MoneyError,
  parseShekels,
  percentageShares,
  reviewAmountChange,
  reviewPaymentAmount,
} from "@homi/shared";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CATEGORIES, createExpenses, createSettlements, createTasks } from "../data/mock";
import { balancesFor, expensePaid, positionsFor } from "../lib/expenses";
import { inputToBps, todayISO } from "../lib/format";
import {
  ALEX_ID,
  JORDAN_ID,
  MEMBERS,
  type Category,
  type Expense,
  type HouseholdState,
  type ScreenName,
  type Settlement,
  type SplitMode,
  type TaskItem,
} from "../types";

const STORAGE_KEY = "homi.prototype.v1";

export type ExpenseDraft = {
  id?: string;
  title: string;
  categoryId: string;
  amount: string;
  billingYear: number;
  billingMonth: number;
  dueDate: string;
  notes: string;
  splitMode: SplitMode;
  alexPercent: string;
  jordanPercent: string;
};

export type TaskDraft = {
  id?: string;
  title: string;
  notes: string;
  assignedMemberId: string;
  dueDate: string;
};

export type SettlementDraft = {
  fromMemberId: string;
  toMemberId: string;
  amount: string;
  settledOn: string;
  note: string;
};

type StoredData = {
  version: 1;
  householdName: string;
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
  tasks: TaskItem[];
  defaultAlexBps: number;
  year: number;
  month: number;
  screen: ScreenName;
};

function createInitialState(): HouseholdState {
  return {
    householdName: "Maple Street",
    categories: CATEGORIES,
    expenses: createExpenses(),
    settlements: createSettlements(),
    tasks: createTasks(),
    defaultAlexBps: 5000,
    year: 2026,
    month: 11,
    screen: "dashboard",
    expenseEditor: null,
    taskEditor: null,
    settlementEditor: false,
    moreOpen: false,
    notice: null,
  };
}

function loadState(): HouseholdState {
  const initial = createInitialState();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as StoredData;
    if (saved.version !== 1 || !Array.isArray(saved.expenses)) return initial;
    return {
      ...initial,
      householdName: saved.householdName || initial.householdName,
      categories: saved.categories.length > 0 ? saved.categories : initial.categories,
      expenses: saved.expenses,
      settlements: saved.settlements ?? initial.settlements,
      tasks: saved.tasks ?? initial.tasks,
      defaultAlexBps: saved.defaultAlexBps || 5000,
      year: saved.year || 2026,
      month: saved.month || 11,
      screen: saved.screen || "dashboard",
    };
  } catch {
    return initial;
  }
}

function persist(state: HouseholdState) {
  const data: StoredData = {
    version: 1,
    householdName: state.householdName,
    categories: state.categories,
    expenses: state.expenses,
    settlements: state.settlements,
    tasks: state.tasks,
    defaultAlexBps: state.defaultAlexBps,
    year: state.year,
    month: state.month,
    screen: state.screen,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function readAmount(value: string): { ok: true; agorot: number } | { ok: false; error: string } {
  try {
    const agorot = parseShekels(value);
    if (agorot <= 0) return { ok: false, error: "Enter an amount greater than zero." };
    return { ok: true, agorot };
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, error: error.message };
    return { ok: false, error: "Enter a shekel amount with at most two decimal places." };
  }
}

function readSplit(draft: Pick<ExpenseDraft, "splitMode" | "alexPercent" | "jordanPercent">) {
  if (draft.splitMode === "equal") {
    return {
      ok: true as const,
      splitMode: "equal" as const,
      splitBps: [
        { memberId: ALEX_ID, shareBps: 5000 },
        { memberId: JORDAN_ID, shareBps: 5000 },
      ],
    };
  }
  const alex = inputToBps(draft.alexPercent);
  const jordan = inputToBps(draft.jordanPercent);
  if (alex === null || jordan === null) {
    return { ok: false as const, error: "Enter each share as a percentage." };
  }
  try {
    percentageShares(10000, [
      { memberId: ALEX_ID, shareBps: alex },
      { memberId: JORDAN_ID, shareBps: jordan },
    ]);
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "Split percentages must total 100%." };
  }
  return {
    ok: true as const,
    splitMode: alex === 5000 ? ("equal" as const) : ("percentage" as const),
    splitBps: [
      { memberId: ALEX_ID, shareBps: alex },
      { memberId: JORDAN_ID, shareBps: jordan },
    ],
  };
}

type StoreValue = {
  state: HouseholdState;
  members: typeof MEMBERS;
  positions: ReturnType<typeof positionsFor>;
  outstanding: ReturnType<typeof balancesFor>;
  go: (screen: ScreenName) => void;
  shiftMonth: (delta: number) => void;
  setMoreOpen: (open: boolean) => void;
  openExpense: (id: string | null) => void;
  closeExpense: () => void;
  saveExpense: (draft: ExpenseDraft) => string | null;
  deleteExpense: (id: string) => void;
  markPaid: (id: string, memberId?: string) => void;
  markUnpaid: (id: string) => void;
  recordPayment: (id: string, amount: string, memberId: string, paidOn: string) => string | null;
  voidPayment: (expenseId: string, paymentId: string) => void;
  openTask: (id: string | null) => void;
  closeTask: () => void;
  saveTask: (draft: TaskDraft) => string | null;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  openSettlement: () => void;
  closeSettlement: () => void;
  saveSettlement: (draft: SettlementDraft) => string | null;
  voidSettlement: (id: string) => void;
  renameHousehold: (name: string) => void;
  addCategory: (name: string) => string | null;
  saveDefaultSplit: (alexPercent: string, jordanPercent: string) => string | null;
  reset: () => void;
};

const HouseholdContext = createContext<StoreValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HouseholdState>(loadState);

  useEffect(() => {
    persist(state);
  }, [state]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, notice: null }));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  const positions = useMemo(
    () => positionsFor(state.expenses, state.year, state.month),
    [state.expenses, state.year, state.month],
  );
  const outstanding = useMemo(
    () => balancesFor(state.expenses, state.settlements),
    [state.expenses, state.settlements],
  );

  const value = useMemo<StoreValue>(() => {
    return {
      state,
      members: MEMBERS,
      positions,
      outstanding,
      go: (screen) => setState((current) => ({ ...current, screen, moreOpen: false })),
      shiftMonth: (delta) =>
        setState((current) => {
          const index = current.year * 12 + (current.month - 1) + delta;
          const year = Math.floor(index / 12);
          const month = (index % 12) + 1;
          if (year < 2020 || year > 2030) return current;
          return { ...current, year, month };
        }),
      setMoreOpen: (moreOpen) => setState((current) => ({ ...current, moreOpen })),
      openExpense: (id) =>
        setState((current) => ({
          ...current,
          expenseEditor: id ?? "new",
          taskEditor: null,
          settlementEditor: false,
          moreOpen: false,
        })),
      closeExpense: () => setState((current) => ({ ...current, expenseEditor: null })),
      saveExpense: (draft) => {
        const title = draft.title.trim();
        if (!title) return "Give the expense a title.";
        const amount = readAmount(draft.amount);
        if (!amount.ok) return amount.error;
        const split = readSplit(draft);
        if (!split.ok) return split.error;
        const existing = draft.id
          ? state.expenses.find((expense) => expense.id === draft.id && !expense.deleted)
          : undefined;
        if (existing) {
          const review = reviewAmountChange(expensePaid(existing), amount.agorot);
          if (!review.ok) {
            return review.code === "below_payments"
              ? "This amount is below payments already recorded. Void a payment first."
              : "Enter an amount greater than zero.";
          }
        }
        const next: Expense = {
          id: existing?.id ?? uid("expense"),
          title,
          categoryId: draft.categoryId,
          amountAgorot: amount.agorot,
          billingYear: draft.billingYear,
          billingMonth: draft.billingMonth,
          ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
          splitMode: split.splitMode,
          splitBps: split.splitBps,
          payments: existing?.payments ?? [],
        };
        setState((current) => ({
          ...current,
          expenseEditor: null,
          expenses: existing
            ? current.expenses.map((expense) => (expense.id === existing.id ? next : expense))
            : [next, ...current.expenses],
        }));
        return null;
      },
      deleteExpense: (id) =>
        setState((current) => ({
          ...current,
          expenseEditor: null,
          expenses: current.expenses.map((expense) =>
            expense.id === id ? { ...expense, deleted: true } : expense,
          ),
        })),
      markPaid: (id, memberId = ALEX_ID) =>
        setState((current) => {
          const expense = current.expenses.find((item) => item.id === id && !item.deleted);
          if (!expense) return current;
          const paid = expensePaid(expense);
          const remaining = expense.amountAgorot - paid;
          if (remaining <= 0) return current;
          const review = reviewPaymentAmount(expense.amountAgorot, paid, remaining);
          if (!review.ok) {
            return { ...current, notice: "That payment is larger than the remaining amount." };
          }
          return {
            ...current,
            expenses: current.expenses.map((item) =>
              item.id === id
                ? {
                    ...item,
                    payments: [
                      ...item.payments,
                      { id: uid("pay"), memberId, amountAgorot: remaining, paidOn: todayISO() },
                    ],
                  }
                : item,
            ),
          };
        }),
      markUnpaid: (id) =>
        setState((current) => ({
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === id
              ? {
                  ...expense,
                  payments: expense.payments.map((payment) => ({ ...payment, voided: true })),
                }
              : expense,
          ),
        })),
      recordPayment: (id, amount, memberId, paidOn) => {
        const expense = state.expenses.find((item) => item.id === id && !item.deleted);
        if (!expense) return "Expense not found.";
        const parsed = readAmount(amount);
        if (!parsed.ok) return parsed.error;
        const review = reviewPaymentAmount(expense.amountAgorot, expensePaid(expense), parsed.agorot);
        if (!review.ok) {
          return review.code === "exceeds_expense"
            ? "That payment is larger than the remaining amount."
            : "Enter an amount greater than zero.";
        }
        setState((current) => ({
          ...current,
          expenses: current.expenses.map((item) =>
            item.id === id
              ? {
                  ...item,
                  payments: [
                    ...item.payments,
                    {
                      id: uid("pay"),
                      memberId,
                      amountAgorot: parsed.agorot,
                      paidOn: paidOn || todayISO(),
                    },
                  ],
                }
              : item,
          ),
        }));
        return null;
      },
      voidPayment: (expenseId, paymentId) =>
        setState((current) => ({
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  payments: expense.payments.map((payment) =>
                    payment.id === paymentId ? { ...payment, voided: true } : payment,
                  ),
                }
              : expense,
          ),
        })),
      openTask: (id) =>
        setState((current) => ({
          ...current,
          taskEditor: id ?? "new",
          expenseEditor: null,
          settlementEditor: false,
          moreOpen: false,
        })),
      closeTask: () => setState((current) => ({ ...current, taskEditor: null })),
      saveTask: (draft) => {
        const title = draft.title.trim();
        if (!title) return "Give the task a title.";
        if (!draft.dueDate) return "Choose a due date.";
        const existing = draft.id ? state.tasks.find((task) => task.id === draft.id) : undefined;
        const next: TaskItem = {
          id: existing?.id ?? uid("task"),
          title,
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
          assignedMemberId: draft.assignedMemberId,
          dueDate: draft.dueDate,
          status: existing?.status ?? "open",
          ...(existing?.completedAt ? { completedAt: existing.completedAt } : {}),
        };
        setState((current) => ({
          ...current,
          taskEditor: null,
          tasks: existing
            ? current.tasks.map((task) => (task.id === existing.id ? next : task))
            : [next, ...current.tasks],
        }));
        return null;
      },
      toggleTask: (id) =>
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => {
            if (task.id !== id) return task;
            if (task.status === "completed") return { ...task, status: "open" };
            return { ...task, status: "completed", completedAt: todayISO() };
          }),
        })),
      deleteTask: (id) =>
        setState((current) => ({
          ...current,
          taskEditor: null,
          tasks: current.tasks.map((task) => (task.id === id ? { ...task, deleted: true } : task)),
        })),
      openSettlement: () =>
        setState((current) => ({
          ...current,
          settlementEditor: true,
          expenseEditor: null,
          taskEditor: null,
        })),
      closeSettlement: () => setState((current) => ({ ...current, settlementEditor: false })),
      saveSettlement: (draft) => {
        if (draft.fromMemberId === draft.toMemberId) return "Choose two different people.";
        const amount = readAmount(draft.amount);
        if (!amount.ok) return amount.error;
        const settlement: Settlement = {
          id: uid("set"),
          fromMemberId: draft.fromMemberId,
          toMemberId: draft.toMemberId,
          amountAgorot: amount.agorot,
          settledOn: draft.settledOn || todayISO(),
          ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        };
        setState((current) => ({
          ...current,
          settlementEditor: false,
          settlements: [settlement, ...current.settlements],
        }));
        return null;
      },
      voidSettlement: (id) =>
        setState((current) => ({
          ...current,
          settlements: current.settlements.map((settlement) =>
            settlement.id === id ? { ...settlement, voided: true } : settlement,
          ),
        })),
      renameHousehold: (name) =>
        setState((current) => {
          const trimmed = name.trim();
          if (!trimmed) return current;
          return { ...current, householdName: trimmed };
        }),
      addCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return "Name the category.";
        if (state.categories.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) {
          return "That category already exists.";
        }
        const category: Category = { id: uid("cat"), name: trimmed, color: "#6f8b80" };
        setState((current) => ({ ...current, categories: [...current.categories, category] }));
        return null;
      },
      saveDefaultSplit: (alexPercent, jordanPercent) => {
        const split = readSplit({ splitMode: "percentage", alexPercent, jordanPercent });
        if (!split.ok) return split.error;
        const alex = split.splitBps.find((share) => share.memberId === ALEX_ID)?.shareBps ?? 5000;
        setState((current) => ({ ...current, defaultAlexBps: alex }));
        return null;
      },
      reset: () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setState(createInitialState());
      },
    };
  }, [outstanding, positions, state]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const store = useContext(HouseholdContext);
  if (!store) throw new Error("Homi screens must render inside the household provider.");
  return store;
}
