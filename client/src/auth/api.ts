import type { Category, Expense, Member, Settlement, TaskItem } from "../types";

export type AccountSession = {
  user: { id: string; email: string; firstName: string };
  household: { id: string; name: string } | null;
  viewerId: string | null;
  role: "owner" | "member" | null;
  members: Member[];
  workspace: {
    householdName: string;
    categories: Category[];
    expenses: Expense[];
    settlements: Settlement[];
    tasks: TaskItem[];
    defaultViewerBps: number;
  } | null;
  pendingRequest: { householdName: string } | null;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body as T;
}

export function loadSession(): Promise<{ session: AccountSession | null }> {
  return api("/api/session");
}
