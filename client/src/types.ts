export const ALEX_ID = "member-alex";
export const JORDAN_ID = "member-jordan";
export const MEMBER_IDS = [ALEX_ID, JORDAN_ID] as const;

export type Member = {
  id: string;
  name: string;
  role: "Owner" | "Member";
  color: string;
};

export const MEMBERS: readonly Member[] = [
  { id: ALEX_ID, name: "Alex", role: "Owner", color: "#1f7a4d" },
  { id: JORDAN_ID, name: "Jordan", role: "Member", color: "#2f6f9f" },
];

export type ScreenName =
  | "dashboard"
  | "expenses"
  | "balances"
  | "tasks"
  | "history"
  | "settings";

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type SplitMode = "equal" | "percentage";

export type SplitShare = {
  memberId: string;
  shareBps: number;
};

export type Payment = {
  id: string;
  memberId: string;
  amountAgorot: number;
  paidOn: string;
  voided?: boolean;
};

export type Expense = {
  id: string;
  title: string;
  categoryId: string;
  amountAgorot: number;
  billingYear: number;
  billingMonth: number;
  dueDate?: string;
  notes?: string;
  splitMode: SplitMode;
  splitBps: SplitShare[];
  payments: Payment[];
  deleted?: boolean;
};

export type Settlement = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountAgorot: number;
  settledOn: string;
  note?: string;
  voided?: boolean;
};

export type TaskItem = {
  id: string;
  title: string;
  notes?: string;
  assignedMemberId: string;
  dueDate: string;
  status: "open" | "completed";
  completedAt?: string;
  deleted?: boolean;
};

export type HouseholdState = {
  householdName: string;
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
  tasks: TaskItem[];
  defaultAlexBps: number;
  year: number;
  month: number;
  screen: ScreenName;
  expenseEditor: string | null;
  taskEditor: string | null;
  settlementEditor: boolean;
  moreOpen: boolean;
  notice: string | null;
};
