import { parseShekels } from "@homi/shared";
import { ALEX_ID, JORDAN_ID, type Category, type Expense, type Settlement, type TaskItem } from "../types";

export const CATEGORIES: Category[] = [
  { id: "electricity", name: "Electricity", color: "#c98612" },
  { id: "water", name: "Water", color: "#2f7eb8" },
  { id: "building", name: "Building Fees", color: "#6d5cb5" },
  { id: "groceries", name: "Groceries", color: "#2f8f57" },
  { id: "bruno", name: "Bruno", color: "#d86a2f" },
  { id: "other", name: "Other", color: "#6f8b80" },
];

type BillInput = {
  id: string;
  title: string;
  categoryId: string;
  amount: string;
  year: number;
  month: number;
  alexBps?: number;
  payerId?: string;
  paidOn?: string;
  paidAmount?: string;
  dueDate?: string;
  notes?: string;
};

function bill(input: BillInput): Expense {
  const amountAgorot = parseShekels(input.amount);
  const alexBps = input.alexBps ?? 5000;
  const payments = input.payerId
    ? [
        {
          id: `pay-${input.id}`,
          memberId: input.payerId,
          amountAgorot: input.paidAmount ? parseShekels(input.paidAmount) : amountAgorot,
          paidOn: input.paidOn ?? `${input.year}-${String(input.month).padStart(2, "0")}-08`,
        },
      ]
    : [];

  return {
    id: input.id,
    title: input.title,
    categoryId: input.categoryId,
    amountAgorot,
    billingYear: input.year,
    billingMonth: input.month,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    splitMode: alexBps === 5000 ? "equal" : "percentage",
    splitBps: [
      { memberId: ALEX_ID, shareBps: alexBps },
      { memberId: JORDAN_ID, shareBps: 10000 - alexBps },
    ],
    payments,
  };
}

function dated(month: number, day: number): string {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const EARLIER: Array<[number, string | null, string | null, string | null, string | null, string | null]> = [
  [3, null, null, "350.00", "428.40", "164.00"],
  [4, "372.50", "138.20", null, "446.00", "178.00"],
  [5, "388.00", "146.70", "350.00", "512.30", "186.50"],
  [6, "424.90", null, "350.00", "538.00", "172.00"],
  [7, "548.60", "214.30", "350.00", "496.80", "198.00"],
  [8, "512.40", "192.10", "350.00", "544.20", "206.00"],
];

function earlierBills(): Expense[] {
  const expenses: Expense[] = [];
  for (const [month, electricity, water, building, groceries, bruno] of EARLIER) {
    if (electricity) {
      expenses.push(
        bill({
          id: `2026-${month}-electricity`,
          title: "Electricity",
          categoryId: "electricity",
          amount: electricity,
          year: 2026,
          month,
          payerId: ALEX_ID,
          paidOn: dated(month, 16),
        }),
      );
    }
    if (water) {
      expenses.push(
        bill({
          id: `2026-${month}-water`,
          title: "Water",
          categoryId: "water",
          amount: water,
          year: 2026,
          month,
          payerId: JORDAN_ID,
          paidOn: dated(month, 7),
        }),
      );
    }
    if (building) {
      expenses.push(
        bill({
          id: `2026-${month}-building`,
          title: "Building fees",
          categoryId: "building",
          amount: building,
          year: 2026,
          month,
          payerId: ALEX_ID,
          paidOn: dated(month, 1),
        }),
      );
    }
    if (groceries) {
      expenses.push(
        bill({
          id: `2026-${month}-groceries`,
          title: "Groceries",
          categoryId: "groceries",
          amount: groceries,
          year: 2026,
          month,
          payerId: month % 2 === 0 ? JORDAN_ID : ALEX_ID,
          paidOn: dated(month, 18),
        }),
      );
    }
    if (bruno) {
      expenses.push(
        bill({
          id: `2026-${month}-bruno`,
          title: "Bruno",
          categoryId: "bruno",
          amount: bruno,
          year: 2026,
          month,
          payerId: JORDAN_ID,
          paidOn: dated(month, 12),
          notes: "Food and supplies for Bruno.",
        }),
      );
    }
  }
  return expenses;
}

export function createExpenses(): Expense[] {
  return [
    ...earlierBills(),
    bill({
      id: "2026-09-electricity",
      title: "Electricity",
      categoryId: "electricity",
      amount: "418.70",
      year: 2026,
      month: 9,
      payerId: JORDAN_ID,
      paidOn: "2026-09-19",
    }),
    bill({
      id: "2026-09-water",
      title: "Water",
      categoryId: "water",
      amount: "154.80",
      year: 2026,
      month: 9,
      payerId: ALEX_ID,
      paidOn: "2026-09-06",
    }),
    bill({
      id: "2026-09-building",
      title: "Building fees",
      categoryId: "building",
      amount: "350.00",
      year: 2026,
      month: 9,
      payerId: ALEX_ID,
      paidOn: "2026-09-01",
    }),
    bill({
      id: "2026-09-groceries",
      title: "Groceries",
      categoryId: "groceries",
      amount: "586.40",
      year: 2026,
      month: 9,
      payerId: JORDAN_ID,
      paidOn: "2026-09-14",
    }),
    bill({
      id: "2026-09-bruno",
      title: "Bruno vet visit",
      categoryId: "bruno",
      amount: "320.00",
      year: 2026,
      month: 9,
      payerId: ALEX_ID,
      paidOn: "2026-09-21",
      notes: "Annual shots.",
    }),
    bill({
      id: "2026-10-electricity",
      title: "Electricity",
      categoryId: "electricity",
      amount: "452.10",
      year: 2026,
      month: 10,
      payerId: ALEX_ID,
      paidOn: "2026-11-04",
      notes: "Billed for October. Paid in November.",
    }),
    bill({
      id: "2026-10-water",
      title: "Water",
      categoryId: "water",
      amount: "158.40",
      year: 2026,
      month: 10,
      payerId: JORDAN_ID,
      paidOn: "2026-10-09",
    }),
    bill({
      id: "2026-10-building",
      title: "Building fees",
      categoryId: "building",
      amount: "350.00",
      year: 2026,
      month: 10,
      payerId: ALEX_ID,
      paidOn: "2026-10-01",
    }),
    bill({
      id: "2026-10-groceries",
      title: "Groceries",
      categoryId: "groceries",
      amount: "704.20",
      year: 2026,
      month: 10,
      alexBps: 7000,
      payerId: ALEX_ID,
      paidOn: "2026-10-16",
      notes: "Alex covers 70% this month.",
    }),
    bill({
      id: "2026-10-bruno",
      title: "Bruno",
      categoryId: "bruno",
      amount: "214.00",
      year: 2026,
      month: 10,
      payerId: JORDAN_ID,
      paidOn: "2026-10-11",
    }),
    bill({
      id: "2026-11-electricity",
      title: "Electricity",
      categoryId: "electricity",
      amount: "486.40",
      year: 2026,
      month: 11,
      dueDate: "2026-11-20",
    }),
    bill({
      id: "2026-11-water",
      title: "Water",
      categoryId: "water",
      amount: "166.80",
      year: 2026,
      month: 11,
      payerId: JORDAN_ID,
      paidOn: "2026-11-03",
    }),
    bill({
      id: "2026-11-building",
      title: "Building fees",
      categoryId: "building",
      amount: "350.00",
      year: 2026,
      month: 11,
      payerId: ALEX_ID,
      paidOn: "2026-11-01",
    }),
    bill({
      id: "2026-11-groceries",
      title: "Groceries",
      categoryId: "groceries",
      amount: "628.50",
      year: 2026,
      month: 11,
      payerId: ALEX_ID,
      paidOn: "2026-11-08",
      notes: "Weekly shop.",
    }),
    bill({
      id: "2026-11-bruno",
      title: "Bruno kibble",
      categoryId: "bruno",
      amount: "248.00",
      year: 2026,
      month: 11,
      payerId: JORDAN_ID,
      paidOn: "2026-11-10",
      paidAmount: "120.00",
      dueDate: "2026-11-15",
      notes: "First bag is paid. The rest is still open.",
    }),
    bill({
      id: "2026-11-groceries-weekend",
      title: "Weekend groceries",
      categoryId: "groceries",
      amount: "186.90",
      year: 2026,
      month: 11,
      dueDate: "2026-11-12",
    }),
  ];
}

export function createSettlements(): Settlement[] {
  return [
    {
      id: "set-aug",
      fromMemberId: ALEX_ID,
      toMemberId: JORDAN_ID,
      amountAgorot: parseShekels("80.00"),
      settledOn: "2026-08-30",
      note: "August leftovers",
    },
    {
      id: "set-oct",
      fromMemberId: JORDAN_ID,
      toMemberId: ALEX_ID,
      amountAgorot: parseShekels("250.00"),
      settledOn: "2026-10-28",
      note: "October catch-up",
    },
  ];
}

export function createTasks(): TaskItem[] {
  return [
    {
      id: "task-bowls",
      title: "Wash Bruno's bowls",
      notes: "The water bowl by the door is getting grimy.",
      assignedMemberId: ALEX_ID,
      dueDate: "2026-11-06",
      status: "open",
    },
    {
      id: "task-grooming",
      title: "Book Bruno's grooming",
      assignedMemberId: JORDAN_ID,
      dueDate: "2026-11-08",
      status: "open",
    },
    {
      id: "task-food",
      title: "Buy Bruno's food",
      assignedMemberId: ALEX_ID,
      dueDate: "2026-11-10",
      status: "open",
    },
    {
      id: "task-plants",
      title: "Water the plants",
      assignedMemberId: ALEX_ID,
      dueDate: "2026-11-09",
      status: "completed",
      completedAt: "2026-11-10",
    },
    {
      id: "task-building",
      title: "Pay the building fees",
      assignedMemberId: ALEX_ID,
      dueDate: "2026-11-01",
      status: "completed",
      completedAt: "2026-11-01",
    },
    {
      id: "task-trash",
      title: "Take out the trash",
      assignedMemberId: JORDAN_ID,
      dueDate: "2026-11-11",
      status: "open",
    },
    {
      id: "task-kitchen",
      title: "Clean the kitchen",
      assignedMemberId: ALEX_ID,
      dueDate: "2026-11-14",
      status: "open",
    },
    {
      id: "task-soap",
      title: "Restock household soap",
      assignedMemberId: JORDAN_ID,
      dueDate: "2026-11-18",
      status: "open",
    },
  ];
}
