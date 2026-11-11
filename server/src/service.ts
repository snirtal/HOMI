import bcrypt from "bcryptjs";
import { ApiError } from "./errors.js";
import {
  MemoryStore,
  type AppStore,
  type HouseholdRecord,
  type InvitationRecord,
  type MemberRecord,
  type UserRecord,
  type Workspace,
} from "./store.js";
import { hashSecret, newSecret } from "./tokens.js";

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const STARTER_CATEGORIES = [
  { id: "electricity", name: "Electricity", color: "#c98612" },
  { id: "water", name: "Water", color: "#2f7eb8" },
  { id: "building", name: "Building Fees", color: "#6d5cb5" },
  { id: "groceries", name: "Groceries", color: "#2f8f57" },
  { id: "bruno", name: "Bruno", color: "#d86a2f" },
  { id: "other", name: "Other", color: "#6f8b80" },
];

export type PublicUser = { id: string; email: string; firstName: string };

export type SessionView = {
  user: PublicUser;
  household: { id: string; name: string } | null;
  viewerId: string | null;
  role: "owner" | "member" | null;
  members: { id: string; name: string; role: "Owner" | "Member"; color: string }[];
  workspace: Workspace | null;
  pendingRequest: { householdName: string } | null;
};

export type InvitationView = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

const COLORS = ["#1f7a4d", "#2f6f9f", "#d86a2f", "#6d5cb5", "#c98612"];

function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, firstName: user.displayName };
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createService(
  store: AppStore = new MemoryStore(),
  options: { now?: () => Date; passwordRounds?: number } = {},
) {
  const now = () => options.now?.() ?? new Date();
  const rounds = options.passwordRounds ?? 10;

  async function requireUser(userId: string): Promise<UserRecord> {
    const user = await store.userById(userId);
    if (!user) throw new ApiError(401, "Sign in again.");
    return user;
  }

  async function viewFor(user: UserRecord): Promise<SessionView> {
    const membership = await store.activeMemberForUser(user.id);
    const pending = await store.pendingRequestForUser(user.id);
    const pendingHome = pending ? await store.householdById(pending.householdId) : undefined;
    if (!membership) {
      return {
        user: publicUser(user),
        household: null,
        viewerId: null,
        role: null,
        members: [],
        workspace: null,
        pendingRequest: pendingHome ? { householdName: pendingHome.name } : null,
      };
    }
    const household = await store.householdById(membership.householdId);
    if (!household) throw new ApiError(404, "That home is not available.");
    return {
      user: publicUser(user),
      household: { id: household.id, name: household.name },
      viewerId: membership.id,
      role: membership.role,
      members: await memberViews(household.id),
      workspace: household.workspace,
      pendingRequest: null,
    };
  }

  async function memberViews(householdId: string): Promise<SessionView["members"]> {
    const members = await store.activeMembers(householdId);
    const views = [];
    for (const [index, member] of members.entries()) {
      const user = await store.userById(member.userId);
      views.push({
        id: member.id,
        name: user?.displayName ?? "Member",
        role: member.role === "owner" ? ("Owner" as const) : ("Member" as const),
        color: COLORS[index % COLORS.length] ?? "#1f7a4d",
      });
    }
    return views;
  }

  async function requireOwner(userId: string): Promise<{ member: MemberRecord; household: HouseholdRecord }> {
    const member = await store.activeMemberForUser(userId);
    if (!member) throw new ApiError(404, "That home is not available.");
    if (member.role !== "owner") throw new ApiError(403, "Only the owner can do that.");
    const household = await store.householdById(member.householdId);
    if (!household) throw new ApiError(404, "That home is not available.");
    return { member, household };
  }

  async function invitationByToken(token: string): Promise<InvitationRecord | undefined> {
    if (!token) return undefined;
    return store.invitationByTokenHash(hashSecret(token));
  }

  function assertInviteOpen(invitation: InvitationRecord | undefined): InvitationRecord {
    if (!invitation || invitation.revokedAt || new Date(invitation.expiresAt).getTime() <= now().getTime()) {
      throw new ApiError(404, "This invitation has expired or is no longer available.");
    }
    return invitation;
  }

  async function decide(userId: string, requestId: string, status: "approved" | "rejected"): Promise<void> {
    const { household } = await requireOwner(userId);
    await store.transaction(async (tx) => {
      const request = await tx.lockPendingRequest(household.id, requestId);
      if (!request || request.householdId !== household.id || request.status !== "pending") {
        throw new ApiError(404, "That request is not pending.");
      }
      await tx.markRequest(request.id, status, userId, now().toISOString());
      if (status === "rejected") return;
      if (await tx.activeMemberForUser(request.userId)) return;
      await tx.insertMember({
        id: crypto.randomUUID(),
        householdId: household.id,
        userId: request.userId,
        role: "member",
        defaultShareBps: 5000,
        leftAt: null,
      });
      if ((await tx.getDefaultViewerBps(household.id)) === 10000) {
        await tx.setDefaultViewerBps(household.id, 5000);
      }
    });
  }

  return {
    store,

    async signup(input: { firstName: string; email: string; password: string }): Promise<{ token: string; view: SessionView }> {
      const firstName = input.firstName.trim();
      const email = normalizeEmail(input.email);
      if (!firstName) throw new ApiError(400, "Enter your first name.");
      if (firstName.length > 40) throw new ApiError(400, "Use a shorter first name.");
      if (!validEmail(email)) throw new ApiError(400, "Enter a valid email.");
      if (input.password.length < 8) throw new ApiError(400, "Use at least 8 characters.");
      if (await store.userByEmail(email)) throw new ApiError(400, "An account with this email already exists.");
      const user: UserRecord = {
        id: crypto.randomUUID(),
        email,
        passwordHash: bcrypt.hashSync(input.password, rounds),
        displayName: firstName,
        createdAt: now().toISOString(),
      };
      await store.insertUser(user);
      return { token: await this.createSession(user.id), view: await viewFor(user) };
    },

    async login(input: { email: string; password: string }): Promise<{ token: string; view: SessionView }> {
      const email = normalizeEmail(input.email);
      const user = await store.userByEmail(email);
      if (!user || !bcrypt.compareSync(input.password, user.passwordHash)) {
        throw new ApiError(401, "Email or password is incorrect.");
      }
      return { token: await this.createSession(user.id), view: await viewFor(user) };
    },

    async createSession(userId: string): Promise<string> {
      const token = newSecret();
      await store.insertSession({
        id: crypto.randomUUID(),
        userId,
        tokenHash: hashSecret(token),
        expiresAt: addDays(now(), SESSION_DAYS),
      });
      return token;
    },

    async logout(token: string | null): Promise<void> {
      if (!token) return;
      await store.deleteSessionByTokenHash(hashSecret(token));
    },

    async sessionView(token: string | null): Promise<SessionView | null> {
      if (!token) return null;
      const tokenHash = hashSecret(token);
      const session = await store.sessionByTokenHash(tokenHash);
      if (!session) return null;
      if (new Date(session.expiresAt).getTime() <= now().getTime()) {
        await store.deleteSessionByTokenHash(tokenHash);
        return null;
      }
      const user = await store.userById(session.userId);
      if (!user) return null;
      return viewFor(user);
    },

    async createHousehold(userId: string, name: string): Promise<SessionView> {
      const user = await requireUser(userId);
      if (await store.activeMemberForUser(userId)) throw new ApiError(400, "You already have a home.");
      const trimmed = name.trim();
      if (!trimmed) throw new ApiError(400, "Name the household.");
      if (trimmed.length > 60) throw new ApiError(400, "Use a shorter household name.");
      const household: HouseholdRecord = {
        id: crypto.randomUUID(),
        name: trimmed,
        createdBy: userId,
        createdAt: now().toISOString(),
        workspace: {
          householdName: trimmed,
          categories: STARTER_CATEGORIES,
          expenses: [],
          settlements: [],
          tasks: [],
          defaultViewerBps: 10000,
        },
      };
      await store.transaction(async (tx) => {
        await tx.insertHousehold(household);
        await tx.insertMember({
          id: crypto.randomUUID(),
          householdId: household.id,
          userId,
          role: "owner",
          defaultShareBps: 10000,
          leftAt: null,
        });
      });
      return viewFor(user);
    },

    async createInvitation(userId: string): Promise<{ invitation: InvitationView; token: string }> {
      const { household } = await requireOwner(userId);
      const token = newSecret();
      const invitation: InvitationRecord = {
        id: crypto.randomUUID(),
        householdId: household.id,
        tokenHash: hashSecret(token),
        invitedBy: userId,
        expiresAt: addDays(now(), INVITE_DAYS),
        revokedAt: null,
        createdAt: now().toISOString(),
      };
      await store.insertInvitation(invitation);
      return { invitation: toInvitationView(invitation), token };
    },

    async listInvitations(userId: string): Promise<InvitationView[]> {
      const { household } = await requireOwner(userId);
      const invitations = await store.listInvitations(household.id);
      return invitations.map(toInvitationView);
    },

    async revokeInvitation(userId: string, invitationId: string): Promise<void> {
      const { household } = await requireOwner(userId);
      const revoked = await store.revokeInvitation(household.id, invitationId, now().toISOString());
      if (!revoked) throw new ApiError(404, "That invitation is not available.");
    },

    async previewInvitation(token: string): Promise<{ householdName: string }> {
      const invitation = assertInviteOpen(await invitationByToken(token));
      const household = await store.householdById(invitation.householdId);
      if (!household) throw new ApiError(404, "This invitation has expired or is no longer available.");
      return { householdName: household.name };
    },

    async requestToJoin(userId: string, token: string): Promise<{ householdName: string }> {
      await requireUser(userId);
      if (await store.activeMemberForUser(userId)) throw new ApiError(400, "You already have a home.");
      const invitation = assertInviteOpen(await invitationByToken(token));
      const household = await store.householdById(invitation.householdId);
      if (!household) throw new ApiError(404, "This invitation has expired or is no longer available.");
      const members = await store.activeMembers(household.id);
      if (members.some((member) => member.userId === userId)) throw new ApiError(400, "You are already in this home.");
      if (await store.pendingRequest(household.id, userId)) throw new ApiError(400, "You already asked to join this home.");
      await store.insertRequest({
        id: crypto.randomUUID(),
        householdId: household.id,
        invitationId: invitation.id,
        userId,
        status: "pending",
        createdAt: now().toISOString(),
        decidedAt: null,
        decidedBy: null,
      });
      return { householdName: household.name };
    },

    async listRequests(userId: string): Promise<{ id: string; firstName: string; email: string; createdAt: string }[]> {
      const { household } = await requireOwner(userId);
      const requests = await store.listPending(household.id);
      const listed = [];
      for (const request of requests) {
        const applicant = await store.userById(request.userId);
        listed.push({
          id: request.id,
          firstName: applicant?.displayName ?? "Member",
          email: applicant?.email ?? "",
          createdAt: request.createdAt,
        });
      }
      return listed;
    },

    approveRequest(userId: string, requestId: string): Promise<void> {
      return decide(userId, requestId, "approved");
    },

    rejectRequest(userId: string, requestId: string): Promise<void> {
      return decide(userId, requestId, "rejected");
    },

    async saveWorkspace(userId: string, workspace: Workspace): Promise<Workspace> {
      const member = await store.activeMemberForUser(userId);
      if (!member) throw new ApiError(404, "That home is not available.");
      const next = readWorkspace(workspace);
      await store.transaction(async (tx) => {
        const household = await tx.householdById(member.householdId);
        if (!household) throw new ApiError(404, "That home is not available.");
        await tx.saveWorkspace(member.householdId, next, userId);
      });
      return next;
    },
  };
}

function toInvitationView(invitation: InvitationRecord): InvitationView {
  return {
    id: invitation.id,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
  };
}

function readWorkspace(input: Workspace): Workspace {
  if (!input || typeof input !== "object") throw new ApiError(400, "Household data is incomplete.");
  const name = typeof input.householdName === "string" ? input.householdName.trim() : "";
  if (!name) throw new ApiError(400, "Name the household.");
  if (!Array.isArray(input.categories) || !Array.isArray(input.expenses) || !Array.isArray(input.settlements) || !Array.isArray(input.tasks)) {
    throw new ApiError(400, "Household data is incomplete.");
  }
  if (!Number.isInteger(input.defaultViewerBps) || input.defaultViewerBps < 0 || input.defaultViewerBps > 10000) {
    throw new ApiError(400, "The default split is invalid.");
  }
  return {
    householdName: name,
    categories: input.categories,
    expenses: input.expenses,
    settlements: input.settlements,
    tasks: input.tasks,
    defaultViewerBps: input.defaultViewerBps,
  };
}
