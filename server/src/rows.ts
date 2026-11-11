import { MoneyError, percentageShares } from "@homi/shared";
import { ApiError } from "./errors.js";

export function agorotToNumeric(agorot: number): string {
  if (!Number.isSafeInteger(agorot)) throw new ApiError(400, "Enter an amount greater than zero.");
  const sign = agorot < 0 ? "-" : "";
  const abs = Math.abs(agorot);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function numericToAgorot(value: string): number {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = `${fraction}00`.slice(0, 2);
  const agorot = Number(whole) * 100 + Number(cents);
  if (!Number.isSafeInteger(agorot)) throw new ApiError(400, "Enter an amount greater than zero.");
  return negative ? -agorot : agorot;
}

export type StoredCategory = { key: string; name: string; color: string; sortOrder: number; system: boolean };

export type StoredSplit = { memberId: string; shareBps: number; shareAgorot: number };

export type StoredPayment = {
  externalId: string;
  memberId: string;
  amountAgorot: number;
  paidOn: string;
  voided: boolean;
};

export type StoredExpense = {
  externalId: string;
  title: string;
  categoryKey: string;
  amountAgorot: number;
  billingYear: number;
  billingMonth: number;
  dueDate: string | null;
  notes: string | null;
  splitMode: "equal" | "percentage";
  deleted: boolean;
  splits: StoredSplit[];
  payments: StoredPayment[];
};

export type StoredSettlement = {
  externalId: string;
  fromMemberId: string;
  toMemberId: string;
  amountAgorot: number;
  settledOn: string;
  note: string | null;
  voided: boolean;
};

export type StoredTask = {
  externalId: string;
  title: string;
  notes: string | null;
  assignedMemberId: string;
  dueDate: string;
  status: "open" | "completed";
  completedOn: string | null;
  deleted: boolean;
};

const STARTER = new Set(["electricity", "water", "building", "groceries", "bruno", "other"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, `${label} is incomplete.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new ApiError(400, `${label} is incomplete.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new ApiError(400, `${label} is incomplete.`);
  return trimmed;
}

function dateOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new ApiError(400, "Household data is incomplete.");
  return value;
}

function money(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError(400, label);
  }
  return value;
}

export function parseCategories(input: unknown[]): StoredCategory[] {
  const seen = new Set<string>();
  return input.map((item, index) => {
    const row = record(item, "A category");
    const key = text(row.id, "A category", 80);
    const name = text(row.name, "A category", 40);
    const color = text(row.color, "A category", 32);
    if (seen.has(key) || seen.has(name.toLowerCase())) throw new ApiError(400, "That category already exists.");
    seen.add(key);
    seen.add(name.toLowerCase());
    return { key, name, color, sortOrder: index, system: STARTER.has(key) };
  });
}

export function parseExpenses(input: unknown[], categoryKeys: Set<string>, memberIds: Set<string>): StoredExpense[] {
  return input.map((item) => {
    const row = record(item, "An expense");
    const externalId = text(row.id, "An expense", 80);
    const title = text(row.title, "An expense", 120);
    const categoryKey = text(row.categoryId, "An expense", 80);
    if (!categoryKeys.has(categoryKey)) throw new ApiError(400, "Household data is incomplete.");
    const amountAgorot = money(row.amountAgorot, "Enter an amount greater than zero.");
    const billingYear = row.billingYear;
    const billingMonth = row.billingMonth;
    if (typeof billingYear !== "number" || billingYear < 1970 || billingYear > 2200) {
      throw new ApiError(400, "Household data is incomplete.");
    }
    if (typeof billingMonth !== "number" || billingMonth < 1 || billingMonth > 12) {
      throw new ApiError(400, "Household data is incomplete.");
    }
    const splitMode = row.splitMode === "percentage" ? "percentage" : row.splitMode === "equal" ? "equal" : null;
    if (!splitMode) throw new ApiError(400, "Household data is incomplete.");
    if (!Array.isArray(row.splitBps)) throw new ApiError(400, "Household data is incomplete.");
    const splits = row.splitBps.map((split) => {
      const share = record(split, "A split");
      const memberId = text(share.memberId, "A split", 80);
      if (!memberIds.has(memberId)) throw new ApiError(400, "Household data is incomplete.");
      if (typeof share.shareBps !== "number" || !Number.isSafeInteger(share.shareBps)) {
        throw new ApiError(400, "The default split is invalid.");
      }
      return { memberId, shareBps: share.shareBps };
    });
    let shares;
    try {
      shares = percentageShares(amountAgorot, splits);
    } catch (error) {
      if (error instanceof MoneyError) throw new ApiError(400, error.message);
      throw error;
    }
    if (!Array.isArray(row.payments)) throw new ApiError(400, "Household data is incomplete.");
    const payments = row.payments.map((payment) => {
      const paid = record(payment, "A payment");
      const memberId = text(paid.memberId, "A payment", 80);
      if (!memberIds.has(memberId)) throw new ApiError(400, "Household data is incomplete.");
      const paidOn = dateOrNull(paid.paidOn);
      if (!paidOn) throw new ApiError(400, "Household data is incomplete.");
      return {
        externalId: text(paid.id, "A payment", 80),
        memberId,
        amountAgorot: money(paid.amountAgorot, "Enter an amount greater than zero."),
        paidOn,
        voided: paid.voided === true,
      };
    });
    return {
      externalId,
      title,
      categoryKey,
      amountAgorot,
      billingYear,
      billingMonth,
      dueDate: dateOrNull(row.dueDate),
      notes: typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : null,
      splitMode,
      deleted: row.deleted === true,
      splits: shares.map((share) => ({
        memberId: share.memberId,
        shareBps: share.shareBps,
        shareAgorot: share.shareAgorot,
      })),
      payments,
    };
  });
}

export function parseSettlements(input: unknown[], memberIds: Set<string>): StoredSettlement[] {
  return input.map((item) => {
    const row = record(item, "A settlement");
    const fromMemberId = text(row.fromMemberId, "A settlement", 80);
    const toMemberId = text(row.toMemberId, "A settlement", 80);
    if (fromMemberId === toMemberId || !memberIds.has(fromMemberId) || !memberIds.has(toMemberId)) {
      throw new ApiError(400, "Household data is incomplete.");
    }
    const settledOn = dateOrNull(row.settledOn);
    if (!settledOn) throw new ApiError(400, "Household data is incomplete.");
    return {
      externalId: text(row.id, "A settlement", 80),
      fromMemberId,
      toMemberId,
      amountAgorot: money(row.amountAgorot, "Enter an amount greater than zero."),
      settledOn,
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
      voided: row.voided === true,
    };
  });
}

export function parseTasks(input: unknown[], memberIds: Set<string>): StoredTask[] {
  return input.map((item) => {
    const row = record(item, "A task");
    const assignedMemberId = text(row.assignedMemberId, "A task", 80);
    if (!memberIds.has(assignedMemberId)) throw new ApiError(400, "Household data is incomplete.");
    const dueDate = dateOrNull(row.dueDate);
    if (!dueDate) throw new ApiError(400, "Choose a due date.");
    const status = row.status === "completed" ? "completed" : "open";
    return {
      externalId: text(row.id, "A task", 80),
      title: text(row.title, "A task", 120),
      notes: typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : null,
      assignedMemberId,
      dueDate,
      status,
      completedOn: status === "completed" ? dateOrNull(row.completedAt) ?? dueDate : null,
      deleted: row.deleted === true,
    };
  });
}
