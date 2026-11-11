export type MemberRole = "owner" | "member";
export type RequestStatus = "pending" | "approved" | "rejected";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
};

export type Workspace = {
  householdName: string;
  categories: unknown[];
  expenses: unknown[];
  settlements: unknown[];
  tasks: unknown[];
  defaultViewerBps: number;
};

export type HouseholdRecord = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  workspace: Workspace;
};

export type MemberRecord = {
  id: string;
  householdId: string;
  userId: string;
  role: MemberRole;
  defaultShareBps: number;
  leftAt: string | null;
};

export type InvitationRecord = {
  id: string;
  householdId: string;
  tokenHash: string;
  invitedBy: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type JoinRequestRecord = {
  id: string;
  householdId: string;
  invitationId: string;
  userId: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

export class MemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly households = new Map<string, HouseholdRecord>();
  readonly members: MemberRecord[] = [];
  readonly invitations: InvitationRecord[] = [];
  readonly requests: JoinRequestRecord[] = [];

  userByEmail(email: string): UserRecord | undefined {
    return [...this.users.values()].find((user) => user.email === email);
  }

  activeMemberForUser(userId: string): MemberRecord | undefined {
    return this.members.find((member) => member.userId === userId && member.leftAt === null);
  }

  activeMembers(householdId: string): MemberRecord[] {
    return this.members.filter((member) => member.householdId === householdId && member.leftAt === null);
  }

  pendingRequest(householdId: string, userId: string): JoinRequestRecord | undefined {
    return this.requests.find(
      (request) => request.householdId === householdId && request.userId === userId && request.status === "pending",
    );
  }

  userById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  insertUser(user: UserRecord): void {
    this.users.set(user.id, user);
  }

  insertSession(session: SessionRecord): void {
    this.sessions.set(session.id, session);
  }

  sessionByTokenHash(tokenHash: string): SessionRecord | undefined {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash);
  }

  deleteSessionByTokenHash(tokenHash: string): void {
    for (const [id, session] of this.sessions) {
      if (session.tokenHash === tokenHash) this.sessions.delete(id);
    }
  }

  insertMember(member: MemberRecord): void {
    this.members.push(member);
  }

  householdById(id: string): HouseholdRecord | undefined {
    return this.households.get(id);
  }

  insertHousehold(household: HouseholdRecord): void {
    this.households.set(household.id, household);
  }

  invitationByTokenHash(tokenHash: string): InvitationRecord | undefined {
    return this.invitations.find((invitation) => invitation.tokenHash === tokenHash);
  }

  insertInvitation(invitation: InvitationRecord): void {
    this.invitations.push(invitation);
  }

  listInvitations(householdId: string): InvitationRecord[] {
    return this.invitations.filter((invitation) => invitation.householdId === householdId);
  }

  revokeInvitation(householdId: string, invitationId: string, at: string): boolean {
    const invitation = this.invitations.find((item) => item.id === invitationId && item.householdId === householdId);
    if (!invitation) return false;
    if (!invitation.revokedAt) invitation.revokedAt = at;
    return true;
  }

  pendingRequestForUser(userId: string): JoinRequestRecord | undefined {
    return this.requests.find((request) => request.userId === userId && request.status === "pending");
  }

  insertRequest(request: JoinRequestRecord): void {
    this.requests.push(request);
  }

  listPending(householdId: string): JoinRequestRecord[] {
    return this.requests.filter((request) => request.householdId === householdId && request.status === "pending");
  }

  saveWorkspace(householdId: string, workspace: Workspace, _actorUserId: string): void {
    const household = this.households.get(householdId);
    if (!household) return;
    household.name = workspace.householdName;
    household.workspace = workspace;
  }

  lockPendingRequest(householdId: string, requestId: string): JoinRequestRecord | undefined {
    return this.requests.find(
      (request) => request.id === requestId && request.householdId === householdId && request.status === "pending",
    );
  }

  markRequest(requestId: string, status: "approved" | "rejected", decidedBy: string, decidedAt: string): void {
    const request = this.requests.find((item) => item.id === requestId);
    if (!request) return;
    request.status = status;
    request.decidedBy = decidedBy;
    request.decidedAt = decidedAt;
  }

  getDefaultViewerBps(householdId: string): number {
    return this.households.get(householdId)?.workspace.defaultViewerBps ?? 10000;
  }

  setDefaultViewerBps(householdId: string, bps: number): void {
    const household = this.households.get(householdId);
    if (!household) return;
    household.workspace = { ...household.workspace, defaultViewerBps: bps };
  }

  transaction<T>(run: (store: AppStore) => Promise<T>): Promise<T> {
    return run(this);
  }
}

export type Maybe<T> = T | Promise<T>;

export type AppStore = {
  userByEmail(email: string): Maybe<UserRecord | undefined>;
  userById(id: string): Maybe<UserRecord | undefined>;
  insertUser(user: UserRecord): Maybe<void>;
  insertSession(session: SessionRecord): Maybe<void>;
  sessionByTokenHash(tokenHash: string): Maybe<SessionRecord | undefined>;
  deleteSessionByTokenHash(tokenHash: string): Maybe<void>;
  activeMemberForUser(userId: string): Maybe<MemberRecord | undefined>;
  activeMembers(householdId: string): Maybe<MemberRecord[]>;
  insertMember(member: MemberRecord): Maybe<void>;
  householdById(id: string): Maybe<HouseholdRecord | undefined>;
  insertHousehold(household: HouseholdRecord): Maybe<void>;
  invitationByTokenHash(tokenHash: string): Maybe<InvitationRecord | undefined>;
  insertInvitation(invitation: InvitationRecord): Maybe<void>;
  listInvitations(householdId: string): Maybe<InvitationRecord[]>;
  revokeInvitation(householdId: string, invitationId: string, at: string): Maybe<boolean>;
  pendingRequest(householdId: string, userId: string): Maybe<JoinRequestRecord | undefined>;
  pendingRequestForUser(userId: string): Maybe<JoinRequestRecord | undefined>;
  insertRequest(request: JoinRequestRecord): Maybe<void>;
  listPending(householdId: string): Maybe<JoinRequestRecord[]>;
  saveWorkspace(householdId: string, workspace: Workspace, actorUserId: string): Maybe<void>;
  lockPendingRequest(householdId: string, requestId: string): Maybe<JoinRequestRecord | undefined>;
  markRequest(requestId: string, status: "approved" | "rejected", decidedBy: string, decidedAt: string): Maybe<void>;
  getDefaultViewerBps(householdId: string): Maybe<number>;
  setDefaultViewerBps(householdId: string, bps: number): Maybe<void>;
  transaction<T>(run: (store: AppStore) => Promise<T>): Promise<T>;
};
