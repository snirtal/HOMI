import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ApiError } from "./errors.js";
import {
  agorotToNumeric,
  numericToAgorot,
  parseCategories,
  parseExpenses,
  parseSettlements,
  parseTasks,
} from "./rows.js";
import type {
  AppStore,
  HouseholdRecord,
  InvitationRecord,
  JoinRequestRecord,
  MemberRecord,
  MemberRole,
  SessionRecord,
  UserRecord,
  Workspace,
} from "./store.js";

type Db = Pick<Pool | PoolClient, "query">;

type UserRow = { id: string; email: string; password_hash: string; display_name: string; created_at: Date };
type SessionRow = { id: string; user_id: string; token_hash: string; expires_at: Date };
type MemberRow = {
  id: string;
  household_id: string;
  user_id: string;
  role: MemberRole;
  default_share_bps: number;
  left_at: Date | null;
};
type InvitationRow = {
  id: string;
  household_id: string;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};
type RequestRow = {
  id: string;
  household_id: string;
  invitation_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
};

export function createPostgresStore(connectionString: string): AppStore {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    application_name: "homi",
    ssl: local ? undefined : { rejectUnauthorized: true },
  });
  pool.on("error", () => undefined);
  return new PostgresStore(pool, pool);
}

class PostgresStore implements AppStore {
  constructor(
    private readonly db: Db,
    private readonly pool: Pool | null,
  ) {}

  transaction<T>(run: (store: AppStore) => Promise<T>): Promise<T> {
    if (!this.pool) return run(this);
    return inTransaction(this.pool, run);
  }

  async userByEmail(email: string): Promise<UserRecord | undefined> {
    const rows = await this.rows<UserRow>("SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = $1", [email]);
    return rows[0] ? userFrom(rows[0]) : undefined;
  }

  async userById(id: string): Promise<UserRecord | undefined> {
    const rows = await this.rows<UserRow>("SELECT id, email, password_hash, display_name, created_at FROM users WHERE id = $1", [id]);
    return rows[0] ? userFrom(rows[0]) : undefined;
  }

  async insertUser(user: UserRecord): Promise<void> {
    await this.write(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.email, user.passwordHash, user.displayName, user.createdAt],
    );
  }

  async insertSession(session: SessionRecord): Promise<void> {
    await this.write(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [session.id, session.userId, session.tokenHash, session.expiresAt],
    );
  }

  async sessionByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    const rows = await this.rows<SessionRow>(
      "SELECT id, user_id, token_hash, expires_at FROM sessions WHERE token_hash = $1",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return undefined;
    return { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: iso(row.expires_at) };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.write("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }

  async activeMemberForUser(userId: string): Promise<MemberRecord | undefined> {
    const rows = await this.rows<MemberRow>(
      `SELECT id, household_id, user_id, role, default_share_bps, left_at
       FROM household_members
       WHERE user_id = $1 AND left_at IS NULL
       LIMIT 1`,
      [userId],
    );
    return rows[0] ? memberFrom(rows[0]) : undefined;
  }

  async activeMembers(householdId: string): Promise<MemberRecord[]> {
    const rows = await this.rows<MemberRow>(
      `SELECT id, household_id, user_id, role, default_share_bps, left_at
       FROM household_members
       WHERE household_id = $1 AND left_at IS NULL
       ORDER BY joined_at, id`,
      [householdId],
    );
    return rows.map(memberFrom);
  }

  async insertMember(member: MemberRecord): Promise<void> {
    await this.write(
      `INSERT INTO household_members (id, household_id, user_id, role, default_share_bps)
       VALUES ($1, $2, $3, $4, $5)`,
      [member.id, member.householdId, member.userId, member.role, member.defaultShareBps],
    );
  }

  async householdById(id: string): Promise<HouseholdRecord | undefined> {
    const rows = await this.rows<{ id: string; name: string; created_by: string; created_at: Date; default_viewer_bps: number }>(
      "SELECT id, name, created_by, created_at, default_viewer_bps FROM households WHERE id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: iso(row.created_at),
      workspace: await this.workspace(row.id, row.name, row.default_viewer_bps),
    };
  }

  async insertHousehold(household: HouseholdRecord): Promise<void> {
    await this.write(
      `INSERT INTO households (id, name, created_by, created_at, default_viewer_bps)
       VALUES ($1, $2, $3, $4, $5)`,
      [household.id, household.name, household.createdBy, household.createdAt, household.workspace.defaultViewerBps],
    );
    const categories = parseCategories(household.workspace.categories);
    for (const category of categories) await this.upsertCategory(household.id, category);
  }

  async invitationByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined> {
    const rows = await this.rows<InvitationRow>(
      `SELECT id, household_id, token_hash, invited_by, expires_at, revoked_at, created_at
       FROM household_invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? invitationFrom(rows[0]) : undefined;
  }

  async insertInvitation(invitation: InvitationRecord): Promise<void> {
    await this.write(
      `INSERT INTO household_invitations (id, household_id, token_hash, invited_by, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invitation.id, invitation.householdId, invitation.tokenHash, invitation.invitedBy, invitation.expiresAt, invitation.createdAt],
    );
  }

  async listInvitations(householdId: string): Promise<InvitationRecord[]> {
    const rows = await this.rows<InvitationRow>(
      `SELECT id, household_id, token_hash, invited_by, expires_at, revoked_at, created_at
       FROM household_invitations WHERE household_id = $1 ORDER BY created_at`,
      [householdId],
    );
    return rows.map(invitationFrom);
  }

  async revokeInvitation(householdId: string, invitationId: string, at: string): Promise<boolean> {
    const rows = await this.rows<{ id: string }>(
      `UPDATE household_invitations
       SET revoked_at = COALESCE(revoked_at, $3)
       WHERE id = $2 AND household_id = $1
       RETURNING id`,
      [householdId, invitationId, at],
    );
    return rows.length > 0;
  }

  async pendingRequest(householdId: string, userId: string): Promise<JoinRequestRecord | undefined> {
    const rows = await this.requestRows("household_id = $1 AND user_id = $2 AND status = 'pending'", [householdId, userId]);
    return rows[0] ? requestFrom(rows[0]) : undefined;
  }

  async pendingRequestForUser(userId: string): Promise<JoinRequestRecord | undefined> {
    const rows = await this.requestRows("user_id = $1 AND status = 'pending'", [userId]);
    return rows[0] ? requestFrom(rows[0]) : undefined;
  }

  async insertRequest(request: JoinRequestRecord): Promise<void> {
    await this.write(
      `INSERT INTO household_join_requests (id, household_id, invitation_id, user_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [request.id, request.householdId, request.invitationId, request.userId, request.status, request.createdAt],
    );
  }

  async listPending(householdId: string): Promise<JoinRequestRecord[]> {
    const rows = await this.requestRows("household_id = $1 AND status = 'pending' ORDER BY created_at", [householdId]);
    return rows.map(requestFrom);
  }

  async lockPendingRequest(householdId: string, requestId: string): Promise<JoinRequestRecord | undefined> {
    const rows = await this.requestRows("household_id = $1 AND id = $2 AND status = 'pending' FOR UPDATE", [householdId, requestId]);
    return rows[0] ? requestFrom(rows[0]) : undefined;
  }

  async markRequest(requestId: string, status: "approved" | "rejected", decidedBy: string, decidedAt: string): Promise<void> {
    await this.write(
      `UPDATE household_join_requests
       SET status = $2, decided_at = $3, decided_by = $4
       WHERE id = $1 AND status = 'pending'`,
      [requestId, status, decidedAt, decidedBy],
    );
  }

  async getDefaultViewerBps(householdId: string): Promise<number> {
    const rows = await this.rows<{ default_viewer_bps: number }>("SELECT default_viewer_bps FROM households WHERE id = $1", [householdId]);
    return rows[0]?.default_viewer_bps ?? 10000;
  }

  async setDefaultViewerBps(householdId: string, bps: number): Promise<void> {
    await this.write("UPDATE households SET default_viewer_bps = $2 WHERE id = $1", [householdId, bps]);
  }

  async saveWorkspace(householdId: string, workspace: Workspace, actorUserId: string): Promise<void> {
    await this.write("SELECT id FROM households WHERE id = $1 FOR UPDATE", [householdId]);
    const members = await this.activeMembers(householdId);
    const memberIds = new Set(members.map((member) => member.id));
    const categories = parseCategories(workspace.categories);
    const categoryKeys = new Set(categories.map((category) => category.key));
    const expenses = parseExpenses(workspace.expenses, categoryKeys, memberIds);
    const settlements = parseSettlements(workspace.settlements, memberIds);
    const tasks = parseTasks(workspace.tasks, memberIds);

    await this.write("UPDATE households SET name = $2, default_viewer_bps = $3 WHERE id = $1", [
      householdId,
      workspace.householdName,
      workspace.defaultViewerBps,
    ]);
    for (const category of categories) await this.upsertCategory(householdId, category);
    const categoryIds = await this.categoryIds(householdId);

    for (const expense of expenses) {
      const categoryId = categoryIds.get(expense.categoryKey);
      if (!categoryId) throw new ApiError(400, "Household data is incomplete.");
      const expenseId = await this.upsertExpense(householdId, expense, categoryId, actorUserId);
      await this.replaceSplits(expenseId, expense.splits);
      await this.replacePayments(expenseId, expense.payments, actorUserId);
    }
    await this.write(
      `UPDATE expenses SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
       WHERE household_id = $1 AND NOT (external_id = ANY($2::text[]))`,
      [householdId, expenses.map((expense) => expense.externalId)],
    );

    for (const settlement of settlements) await this.upsertSettlement(householdId, settlement, actorUserId);
    await this.write(
      `DELETE FROM settlements WHERE household_id = $1 AND NOT (external_id = ANY($2::text[]))`,
      [householdId, settlements.map((settlement) => settlement.externalId)],
    );

    for (const task of tasks) await this.upsertTask(householdId, task, actorUserId);
    await this.write(
      `UPDATE tasks SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
       WHERE household_id = $1 AND NOT (external_id = ANY($2::text[]))`,
      [householdId, tasks.map((task) => task.externalId)],
    );

    await this.write(
      `DELETE FROM expense_categories
       WHERE household_id = $1 AND NOT (category_key = ANY($2::text[]))`,
      [householdId, categories.map((category) => category.key)],
    );
  }

  private async workspace(householdId: string, name: string, defaultViewerBps: number): Promise<Workspace> {
    const categories = await this.rows<{ category_key: string; name: string; color: string }>(
      `SELECT category_key, name, color FROM expense_categories
       WHERE household_id = $1 ORDER BY sort_order, name`,
      [householdId],
    );
    const expenses = await this.rows<{
      id: string;
      external_id: string;
      title: string;
      category_key: string;
      amount: string;
      billing_year: number;
      billing_month: number;
      due_date: string | null;
      notes: string | null;
      split_mode: "equal" | "percentage";
      deleted_at: Date | null;
    }>(
      `SELECT e.id, e.external_id, e.title, c.category_key, e.amount::text AS amount, e.billing_year, e.billing_month,
              e.due_date::text AS due_date, e.notes, e.split_mode, e.deleted_at
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
       WHERE e.household_id = $1
       ORDER BY e.created_at DESC`,
      [householdId],
    );
    const splits = await this.rows<{ expense_id: string; member_id: string; share_bps: number }>(
      `SELECT s.expense_id, s.member_id, s.share_bps
       FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
       WHERE e.household_id = $1`,
      [householdId],
    );
    const payments = await this.rows<{
      expense_id: string;
      external_id: string;
      member_id: string;
      amount: string;
      paid_on: string;
      voided_at: Date | null;
    }>(
      `SELECT p.expense_id, p.external_id, p.member_id, p.amount::text AS amount, p.paid_on::text AS paid_on, p.voided_at
       FROM expense_payments p JOIN expenses e ON e.id = p.expense_id
       WHERE e.household_id = $1
       ORDER BY p.created_at`,
      [householdId],
    );
    const settlements = await this.rows<{
      external_id: string;
      from_member_id: string;
      to_member_id: string;
      amount: string;
      settled_on: string;
      note: string | null;
      voided_at: Date | null;
    }>(
      `SELECT external_id, from_member_id, to_member_id, amount::text AS amount, settled_on::text AS settled_on, note, voided_at
       FROM settlements WHERE household_id = $1 ORDER BY settled_on, created_at`,
      [householdId],
    );
    const tasks = await this.rows<{
      external_id: string;
      title: string;
      description: string | null;
      assigned_member_id: string | null;
      due_date: string | null;
      status: "open" | "completed";
      completed_at: Date | null;
      deleted_at: Date | null;
    }>(
      `SELECT external_id, title, description, assigned_member_id, due_date::text AS due_date, status, completed_at, deleted_at
       FROM tasks WHERE household_id = $1 ORDER BY created_at DESC`,
      [householdId],
    );

    return {
      householdName: name,
      defaultViewerBps,
      categories: categories.map((category) => ({ id: category.category_key, name: category.name, color: category.color })),
      expenses: expenses.map((expense) => ({
        id: expense.external_id,
        title: expense.title,
        categoryId: expense.category_key,
        amountAgorot: numericToAgorot(expense.amount),
        billingYear: expense.billing_year,
        billingMonth: expense.billing_month,
        ...(expense.due_date ? { dueDate: expense.due_date } : {}),
        ...(expense.notes ? { notes: expense.notes } : {}),
        splitMode: expense.split_mode,
        splitBps: splits
          .filter((split) => split.expense_id === expense.id)
          .map((split) => ({ memberId: split.member_id, shareBps: split.share_bps })),
        payments: payments
          .filter((payment) => payment.expense_id === expense.id)
          .map((payment) => ({
            id: payment.external_id,
            memberId: payment.member_id,
            amountAgorot: numericToAgorot(payment.amount),
            paidOn: payment.paid_on,
            ...(payment.voided_at ? { voided: true } : {}),
          })),
        ...(expense.deleted_at ? { deleted: true } : {}),
      })),
      settlements: settlements.map((settlement) => ({
        id: settlement.external_id,
        fromMemberId: settlement.from_member_id,
        toMemberId: settlement.to_member_id,
        amountAgorot: numericToAgorot(settlement.amount),
        settledOn: settlement.settled_on,
        ...(settlement.note ? { note: settlement.note } : {}),
        ...(settlement.voided_at ? { voided: true } : {}),
      })),
      tasks: tasks.flatMap((task) => {
        if (!task.assigned_member_id || !task.due_date) return [];
        return [{
          id: task.external_id,
          title: task.title,
          ...(task.description ? { notes: task.description } : {}),
          assignedMemberId: task.assigned_member_id,
          dueDate: task.due_date,
          status: task.status,
          ...(task.completed_at ? { completedAt: iso(task.completed_at).slice(0, 10) } : {}),
          ...(task.deleted_at ? { deleted: true } : {}),
        }];
      }),
    };
  }

  private async upsertCategory(householdId: string, category: { key: string; name: string; color: string; sortOrder: number; system: boolean }): Promise<void> {
    await this.write(
      `INSERT INTO expense_categories (household_id, category_key, name, color, sort_order, is_system)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (household_id, category_key) DO UPDATE
       SET name = EXCLUDED.name, color = EXCLUDED.color, sort_order = EXCLUDED.sort_order`,
      [householdId, category.key, category.name, category.color, category.sortOrder, category.system],
    );
  }

  private async categoryIds(householdId: string): Promise<Map<string, string>> {
    const rows = await this.rows<{ id: string; category_key: string }>(
      "SELECT id, category_key FROM expense_categories WHERE household_id = $1",
      [householdId],
    );
    return new Map(rows.map((row) => [row.category_key, row.id]));
  }

  private async upsertExpense(householdId: string, expense: ReturnType<typeof parseExpenses>[number], categoryId: string, actorUserId: string): Promise<string> {
    const rows = await this.rows<{ id: string }>(
      `INSERT INTO expenses (
         household_id, external_id, title, category_id, amount, billing_year, billing_month,
         due_date, notes, split_mode, created_by, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (household_id, external_id) DO UPDATE SET
         title = EXCLUDED.title,
         category_id = EXCLUDED.category_id,
         amount = EXCLUDED.amount,
         billing_year = EXCLUDED.billing_year,
         billing_month = EXCLUDED.billing_month,
         due_date = EXCLUDED.due_date,
         notes = EXCLUDED.notes,
         split_mode = EXCLUDED.split_mode,
         deleted_at = CASE WHEN EXCLUDED.deleted_at IS NULL THEN NULL ELSE COALESCE(expenses.deleted_at, EXCLUDED.deleted_at) END,
         updated_at = now()
       RETURNING id`,
      [
        householdId,
        expense.externalId,
        expense.title,
        categoryId,
        agorotToNumeric(expense.amountAgorot),
        expense.billingYear,
        expense.billingMonth,
        expense.dueDate,
        expense.notes,
        expense.splitMode,
        actorUserId,
        expense.deleted ? new Date().toISOString() : null,
      ],
    );
    const id = rows[0]?.id;
    if (!id) throw new ApiError(500, "Something went wrong.");
    return id;
  }

  private async replaceSplits(expenseId: string, splits: { memberId: string; shareBps: number; shareAgorot: number }[]): Promise<void> {
    await this.write("DELETE FROM expense_splits WHERE expense_id = $1", [expenseId]);
    for (const split of splits) {
      await this.write(
        `INSERT INTO expense_splits (expense_id, member_id, share_bps, share_amount) VALUES ($1, $2, $3, $4)`,
        [expenseId, split.memberId, split.shareBps, agorotToNumeric(split.shareAgorot)],
      );
    }
  }

  private async replacePayments(expenseId: string, payments: { externalId: string; memberId: string; amountAgorot: number; paidOn: string; voided: boolean }[], actorUserId: string): Promise<void> {
    await this.write(
      `DELETE FROM expense_payments WHERE expense_id = $1 AND NOT (external_id = ANY($2::text[]))`,
      [expenseId, payments.map((payment) => payment.externalId)],
    );
    for (const payment of payments) {
      await this.write(
        `INSERT INTO expense_payments (expense_id, external_id, member_id, amount, paid_on, created_by, voided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (external_id) DO UPDATE SET
           member_id = EXCLUDED.member_id,
           amount = EXCLUDED.amount,
           paid_on = EXCLUDED.paid_on,
           voided_at = CASE WHEN EXCLUDED.voided_at IS NULL THEN NULL ELSE COALESCE(expense_payments.voided_at, EXCLUDED.voided_at) END`,
        [
          expenseId,
          payment.externalId,
          payment.memberId,
          agorotToNumeric(payment.amountAgorot),
          payment.paidOn,
          actorUserId,
          payment.voided ? new Date().toISOString() : null,
        ],
      );
    }
  }

  private async upsertSettlement(householdId: string, settlement: ReturnType<typeof parseSettlements>[number], actorUserId: string): Promise<void> {
    await this.write(
      `INSERT INTO settlements (
         household_id, external_id, from_member_id, to_member_id, amount, settled_on, note, created_by, voided_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (household_id, external_id) DO UPDATE SET
         from_member_id = EXCLUDED.from_member_id,
         to_member_id = EXCLUDED.to_member_id,
         amount = EXCLUDED.amount,
         settled_on = EXCLUDED.settled_on,
         note = EXCLUDED.note,
         voided_at = CASE WHEN EXCLUDED.voided_at IS NULL THEN NULL ELSE COALESCE(settlements.voided_at, EXCLUDED.voided_at) END`,
      [
        householdId,
        settlement.externalId,
        settlement.fromMemberId,
        settlement.toMemberId,
        agorotToNumeric(settlement.amountAgorot),
        settlement.settledOn,
        settlement.note,
        actorUserId,
        settlement.voided ? new Date().toISOString() : null,
      ],
    );
  }

  private async upsertTask(householdId: string, task: ReturnType<typeof parseTasks>[number], actorUserId: string): Promise<void> {
    await this.write(
      `INSERT INTO tasks (
         household_id, external_id, title, description, assigned_member_id, due_date, status, completed_at, created_by, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (household_id, external_id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         assigned_member_id = EXCLUDED.assigned_member_id,
         due_date = EXCLUDED.due_date,
         status = EXCLUDED.status,
         completed_at = EXCLUDED.completed_at,
         deleted_at = CASE WHEN EXCLUDED.deleted_at IS NULL THEN NULL ELSE COALESCE(tasks.deleted_at, EXCLUDED.deleted_at) END,
         updated_at = now()`,
      [
        householdId,
        task.externalId,
        task.title,
        task.notes,
        task.assignedMemberId,
        task.dueDate,
        task.status,
        task.completedOn ? `${task.completedOn}T00:00:00.000Z` : null,
        actorUserId,
        task.deleted ? new Date().toISOString() : null,
      ],
    );
  }

  private requestRows(where: string, values: unknown[]): Promise<RequestRow[]> {
    return this.rows<RequestRow>(
      `SELECT id, household_id, invitation_id, user_id, status, created_at, decided_at, decided_by
       FROM household_join_requests WHERE ${where}`,
      values,
    );
  }

  private async rows<T extends QueryResultRow>(text: string, values: unknown[]): Promise<T[]> {
    try {
      const result = await this.db.query<T>(text, values);
      return result.rows;
    } catch (error) {
      scrub(error);
    }
  }

  private async write(text: string, values: unknown[]): Promise<void> {
    await this.rows(text, values);
  }
}

async function inTransaction<T>(pool: Pool, run: (store: AppStore) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(new PostgresStore(client, null));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* The original error is the one to report. */
    }
    scrub(error);
  } finally {
    client.release();
  }
}

function scrub(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const constraint = typeof error === "object" && error && "constraint" in error ? String(error.constraint) : "";
  if (code === "23505" && constraint.includes("email")) throw new ApiError(400, "An account with this email already exists.");
  if (code === "23505" && constraint.includes("pending")) throw new ApiError(400, "You already asked to join this home.");
  if (code === "23505" && constraint.includes("name")) throw new ApiError(400, "That category already exists.");
  if (code === "23505" || code === "23503" || code === "23514") throw new ApiError(400, "Household data is incomplete.");
  if (error instanceof ApiError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (/postgres(ql)?:\/\//i.test(message)) throw new Error("The database request failed.");
  throw error instanceof Error ? error : new Error("The database request failed.");
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function userFrom(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: iso(row.created_at),
  };
}

function memberFrom(row: MemberRow): MemberRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role,
    defaultShareBps: row.default_share_bps,
    leftAt: row.left_at ? iso(row.left_at) : null,
  };
}

function invitationFrom(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    tokenHash: row.token_hash,
    invitedBy: row.invited_by,
    expiresAt: iso(row.expires_at),
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
    createdAt: iso(row.created_at),
  };
}

function requestFrom(row: RequestRow): JoinRequestRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    invitationId: row.invitation_id,
    userId: row.user_id,
    status: row.status,
    createdAt: iso(row.created_at),
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
    decidedBy: row.decided_by,
  };
}
