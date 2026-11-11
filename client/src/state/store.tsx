import {
  MoneyError,
  parseShekels,
  percentageShares,
  reviewAmountChange,
  reviewPaymentAmount,
} from "@homi/shared";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, createExpenses, createSettlements, createTasks } from "../data/mock";
import { balancesFor, expensePaid, positionsFor } from "../lib/expenses";
import { inputToBps, todayISO } from "../lib/format";
import {
  ALEX_ID,
  MEMBERS,
  type Category,
  type Expense,
  type HouseholdState,
  type Member,
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
  members?: Member[];
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
  tasks: TaskItem[];
  defaultAlexBps: number;
  year: number;
  month: number;
  screen: ScreenName;
};

function defaultMembers(): Member[] {
  return MEMBERS.map((member) => ({ ...member }));
}

function restoreMembers(saved: Member[] | undefined): Member[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaultMembers();
  const restored = saved.flatMap((item) => {
    const known = MEMBERS.find((member) => member.id === item.id);
    if (!known) return [];
    const name = typeof item.name === "string" ? item.name.trim() : "";
    return [{ ...known, name: name || known.name }];
  });
  if (!restored.some((member) => member.id === ALEX_ID)) {
    const viewer = MEMBERS.find((member) => member.id === ALEX_ID);
    if (viewer) restored.unshift({ ...viewer });
  }
  return restored.length > 0 ? restored : defaultMembers();
}

function createInitialState(): HouseholdState {
  return {
    householdName: "Maple Street",
    members: defaultMembers(),
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
    viewerId: ALEX_ID,
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
      members: restoreMembers(saved.members),
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
    members: state.members,
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

function equalBps(memberIds: readonly string[]) {
  const ordered = [...memberIds].sort((left, right) => left.localeCompare(right));
  const base = Math.floor(10000 / ordered.length);
  let remainder = 10000 - base * ordered.length;
  return ordered.map((memberId) => {
    const shareBps = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { memberId, shareBps };
  });
}

function readSplit(
  draft: Pick<ExpenseDraft, "splitMode" | "alexPercent" | "jordanPercent">,
  members: readonly Member[],
  viewerId: string,
) {
  const ids = members.map((member) => member.id);
  const viewer = ids.includes(viewerId) ? viewerId : ids[0];
  if (!viewer) return { ok: false as const, error: "Add a household member first." };
  const others = members.filter((member) => member.id !== viewer);
  if (others.length === 0) {
    return {
      ok: true as const,
      splitMode: "equal" as const,
      splitBps: [{ memberId: viewer, shareBps: 10000 }],
    };
  }
  if (draft.splitMode === "equal" || others.length !== 1) {
    return { ok: true as const, splitMode: "equal" as const, splitBps: equalBps(ids) };
  }
  const other = others[0];
  if (!other) return { ok: false as const, error: "Add a household member first." };
  const alex = inputToBps(draft.alexPercent);
  const jordan = inputToBps(draft.jordanPercent);
  if (alex === null || jordan === null) {
    return { ok: false as const, error: "Enter each share as a percentage." };
  }
  try {
    percentageShares(10000, [
      { memberId: viewer, shareBps: alex },
      { memberId: other.id, shareBps: jordan },
    ]);
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "Split percentages must total 100%." };
  }
  return {
    ok: true as const,
    splitMode: alex === 5000 ? ("equal" as const) : ("percentage" as const),
    splitBps: [
      { memberId: viewer, shareBps: alex },
      { memberId: other.id, shareBps: jordan },
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
  renameMember: (id: string, name: string) => void;
  deleteMember: (id: string) => string | null;
  addCategory: (name: string) => string | null;
  deleteCategory: (id: string) => string | null;
  saveDefaultSplit: (alexPercent: string, jordanPercent: string) => string | null;
  reset: () => void;
  youId: string;
};

const HouseholdContext = createContext<StoreValue | null>(null);

export type SharedSlice = {
  householdName: string;
  categories: HouseholdState["categories"];
  expenses: HouseholdState["expenses"];
  settlements: HouseholdState["settlements"];
  tasks: HouseholdState["tasks"];
  defaultViewerBps: number;
};

export type RemoteHome = {
  viewerId: string;
  members: Member[];
  householdName: string;
  categories: HouseholdState["categories"];
  expenses: HouseholdState["expenses"];
  settlements: HouseholdState["settlements"];
  tasks: HouseholdState["tasks"];
  defaultViewerBps: number;
  onSave: (slice: SharedSlice) => void | Promise<void>;
};

function sharedSlice(state: HouseholdState): SharedSlice {
  return {
    householdName: state.householdName,
    categories: state.categories,
    expenses: state.expenses,
    settlements: state.settlements,
    tasks: state.tasks,
    defaultViewerBps: state.defaultAlexBps,
  };
}

function remoteShared(remote: RemoteHome): SharedSlice {
  return {
    householdName: remote.householdName,
    categories: remote.categories,
    expenses: remote.expenses,
    settlements: remote.settlements,
    tasks: remote.tasks,
    defaultViewerBps: remote.defaultViewerBps,
  };
}

function sameRoster(current: Member[], next: Member[]): boolean {
  return (
    current.length === next.length &&
    current.every((member, index) => {
      const other = next[index];
      return other !== undefined && member.id === other.id && member.name === other.name && member.role === other.role;
    })
  );
}

function stateFromRemote(remote: RemoteHome): HouseholdState {
  const today = new Date();
  return {
    householdName: remote.householdName,
    members: remote.members,
    categories: remote.categories,
    expenses: remote.expenses,
    settlements: remote.settlements,
    tasks: remote.tasks,
    defaultAlexBps: remote.defaultViewerBps,
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    screen: "dashboard",
    expenseEditor: null,
    taskEditor: null,
    settlementEditor: false,
    moreOpen: false,
    notice: null,
    viewerId: remote.viewerId,
  };
}

export function HouseholdProvider({ children, remote }: { children: ReactNode; remote?: RemoteHome }) {
  const [state, setState] = useState<HouseholdState>(() => (remote ? stateFromRemote(remote) : loadState()));
  const saveRef = useRef(remote?.onSave);
  saveRef.current = remote?.onSave;
  const savedSlice = useRef<string | null>(null);

  useEffect(() => {
    if (saveRef.current) {
      const body = JSON.stringify(sharedSlice(state));
      if (savedSlice.current === null) {
        savedSlice.current = body;
        return;
      }
      if (body === savedSlice.current) return;
      savedSlice.current = body;
      void Promise.resolve(saveRef.current(JSON.parse(body) as SharedSlice)).catch(() => {
        setState((current) => ({ ...current, notice: "The home could not be saved. Check that Homi is still running." }));
      });
      return;
    }
    persist(state);
  }, [state]);

  const rosterKey = remote?.members.map((member) => `${member.id}:${member.name}:${member.role}`).join("|") ?? "";
  const remoteSliceKey = remote ? `${JSON.stringify(remoteShared(remote))}|${rosterKey}` : "";
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  useEffect(() => {
    const next = remoteRef.current;
    if (!next) return;
    const incoming = JSON.stringify(remoteShared(next));
    setState((current) => {
      const local = JSON.stringify(sharedSlice(current));
      const sameMembers = sameRoster(current.members, next.members);
      if (local === incoming && sameMembers) return current;
      if (savedSlice.current !== null && local !== savedSlice.current) {
        return sameMembers ? current : { ...current, members: next.members };
      }
      savedSlice.current = incoming;
      return {
        ...current,
        householdName: next.householdName,
        categories: next.categories,
        expenses: next.expenses,
        settlements: next.settlements,
        tasks: next.tasks,
        defaultAlexBps: next.defaultViewerBps,
        members: next.members,
      };
    });
  }, [remoteSliceKey]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, notice: null }));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  const memberKey = state.members.map((member) => member.id).join(",");
  const positions = useMemo(
    () => positionsFor(state.expenses, state.year, state.month, state.members.map((member) => member.id)),
    [state.expenses, state.year, state.month, memberKey],
  );
  const outstanding = useMemo(
    () => balancesFor(state.expenses, state.settlements, state.members.map((member) => member.id)),
    [state.expenses, state.settlements, memberKey],
  );

  const value = useMemo<StoreValue>(() => {
    return {
      state,
      members: state.members,
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
        const split = readSplit(draft, state.members, state.viewerId);
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
      markPaid: (id, memberId = state.viewerId) =>
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
        if (state.members.length < 2) return "Transfers need two people.";
        if (draft.fromMemberId === draft.toMemberId) return "Choose two different people.";
        if (!state.members.some((member) => member.id === draft.fromMemberId) || !state.members.some((member) => member.id === draft.toMemberId)) {
          return "Choose two people who are still in the household.";
        }
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
      renameMember: (id, name) =>
        setState((current) => {
          const trimmed = name.trim().slice(0, 40);
          if (!trimmed || !current.members.some((member) => member.id === id)) return current;
          return {
            ...current,
            members: current.members.map((member) => (member.id === id ? { ...member, name: trimmed } : member)),
          };
        }),
      deleteMember: (id) => {
        if (id === state.viewerId) return "The person using this home stays.";
        const removed = state.members.find((member) => member.id === id);
        if (!removed) return "That person is already gone.";
        if (state.members.length <= 1) return "Keep at least one person.";
        setState((current) => ({
          ...current,
          members: current.members.filter((member) => member.id !== id),
          defaultAlexBps: 10000,
          expenses: current.expenses.map((expense) => ({
            ...expense,
            splitMode: "equal",
            splitBps: [{ memberId: state.viewerId, shareBps: 10000 }],
            payments: expense.payments.map((payment) =>
              payment.memberId === id ? { ...payment, memberId: state.viewerId } : payment,
            ),
          })),
          settlements: current.settlements.map((settlement) =>
            settlement.fromMemberId === id || settlement.toMemberId === id
              ? { ...settlement, voided: true }
              : settlement,
          ),
          tasks: current.tasks.map((task) =>
            task.assignedMemberId === id ? { ...task, assignedMemberId: state.viewerId } : task,
          ),
        }));
        return null;
      },
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
      deleteCategory: (id) => {
        const category = state.categories.find((item) => item.id === id);
        if (!category) return "That category is already gone.";
        if (state.categories.length <= 1) return "Keep at least one category.";
        const fallback = state.categories.find((item) => item.id !== id && item.id === "other") ?? state.categories.find((item) => item.id !== id);
        if (!fallback) return "Keep at least one category.";
        setState((current) => ({
          ...current,
          categories: current.categories.filter((item) => item.id !== id),
          expenses: current.expenses.map((expense) =>
            expense.categoryId === id ? { ...expense, categoryId: fallback.id } : expense,
          ),
        }));
        return null;
      },
      saveDefaultSplit: (alexPercent, jordanPercent) => {
        if (state.members.length < 2) {
          setState((current) => ({ ...current, defaultAlexBps: 10000 }));
          return null;
        }
        const split = readSplit({ splitMode: "percentage", alexPercent, jordanPercent }, state.members, state.viewerId);
        if (!split.ok) return split.error;
        const alex = split.splitBps.find((share) => share.memberId === state.viewerId)?.shareBps ?? 5000;
        setState((current) => ({ ...current, defaultAlexBps: alex }));
        return null;
      },
      reset: () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setState(createInitialState());
      },
      youId: state.viewerId,
    };
  }, [outstanding, positions, state]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const store = useContext(HouseholdContext);
  if (!store) throw new Error("Homi screens must render inside the household provider.");
  return store;
}
