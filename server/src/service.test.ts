import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./http.js";
import { createService } from "./service.js";
import { MemoryStore, type Workspace } from "./store.js";

const rounds = 4;

function serviceAt(now = new Date("2026-11-11T10:00:00.000Z")) {
  let clock = now;
  const store = new MemoryStore();
  const service = createService(store, {
    passwordRounds: rounds,
    now: () => clock,
  });
  return {
    service,
    store,
    advanceDays(days: number) {
      clock = new Date(clock.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

function workspace(name = "Maple Street"): Workspace {
  return {
    householdName: name,
    categories: [],
    expenses: [{ id: "bill-1", title: "Electricity" }],
    settlements: [],
    tasks: [],
    defaultViewerBps: 10000,
  };
}

describe("accounts and sessions", () => {
  it("stores a password hash and an http-only session", async () => {
    const { service, store } = serviceAt();
    const created = await service.signup({ firstName: "Snir", email: "Snir@Home.test", password: "correct-horse" });
    const user = [...store.users.values()][0];
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toContain("correct-horse");
    expect(user?.email).toBe("snir@home.test");
    expect(created.view.user.firstName).toBe("Snir");
    expect(created.view.household).toBeNull();

    const signedIn = await service.sessionView(created.token);
    expect(signedIn?.user.email).toBe("snir@home.test");
    await service.logout(created.token);
    expect(await service.sessionView(created.token)).toBeNull();
  });

  it("rejects a wrong password and an expired session", async () => {
    const clock = serviceAt();
    const created = await clock.service.signup({ firstName: "Snir", email: "snir@home.test", password: "correct-horse" });
    await expect(clock.service.login({ email: "snir@home.test", password: "nope-nope" })).rejects.toThrow(/incorrect/i);
    clock.advanceDays(31);
    expect(await clock.service.sessionView(created.token)).toBeNull();
  });
});

describe("invitation approval", () => {
  it("keeps a link usable until it expires or is revoked, and does not grant membership on open", async () => {
    const { service, store } = serviceAt();
    const owner = await service.signup({ firstName: "Alex", email: "alex@home.test", password: "correct-horse" });
    await service.createHousehold(owner.view.user.id, "Maple Street");
    const invite = await service.createInvitation(owner.view.user.id);
    const before = structuredClone(store.invitations[0]);

    expect((await service.previewInvitation(invite.token)).householdName).toBe("Maple Street");
    expect((await service.previewInvitation(invite.token)).householdName).toBe("Maple Street");
    expect(store.requests).toHaveLength(0);
    expect(store.members).toHaveLength(1);
    expect(store.invitations[0]).toEqual(before);

    const guest = await service.signup({ firstName: "Jordan", email: "jordan@home.test", password: "correct-horse" });
    await service.requestToJoin(guest.view.user.id, invite.token);
    expect(store.members.filter((member) => member.userId === guest.view.user.id)).toHaveLength(0);
    expect((await service.previewInvitation(invite.token)).householdName).toBe("Maple Street");

    const second = await service.signup({ firstName: "Sam", email: "sam@home.test", password: "correct-horse" });
    await service.requestToJoin(second.view.user.id, invite.token);
    expect(store.requests).toHaveLength(2);
  });

  it("blocks a second pending request and allows a new request after rejection", async () => {
    const { service, store } = serviceAt();
    const owner = await service.signup({ firstName: "Alex", email: "alex@home.test", password: "correct-horse" });
    await service.createHousehold(owner.view.user.id, "Maple Street");
    const invite = await service.createInvitation(owner.view.user.id);
    const guest = await service.signup({ firstName: "Jordan", email: "jordan@home.test", password: "correct-horse" });
    await service.requestToJoin(guest.view.user.id, invite.token);
    await expect(service.requestToJoin(guest.view.user.id, invite.token)).rejects.toThrow(/already asked/i);

    const pending = (await service.listRequests(owner.view.user.id))[0];
    expect(pending?.email).toBe("jordan@home.test");
    if (!pending) throw new Error("missing request");
    await service.rejectRequest(owner.view.user.id, pending.id);
    expect(store.activeMemberForUser(guest.view.user.id)).toBeUndefined();
    await service.requestToJoin(guest.view.user.id, invite.token);
    expect(store.requests.filter((request) => request.status === "pending")).toHaveLength(1);
  });

  it("lets only the owner approve, then shares the same household data", async () => {
    const { service, store } = serviceAt();
    const owner = await service.signup({ firstName: "Alex", email: "alex@home.test", password: "correct-horse" });
    await service.createHousehold(owner.view.user.id, "Maple Street");
    const invite = await service.createInvitation(owner.view.user.id);
    const guest = await service.signup({ firstName: "Jordan", email: "jordan@home.test", password: "correct-horse" });
    await service.requestToJoin(guest.view.user.id, invite.token);
    const pending = (await service.listRequests(owner.view.user.id))[0];
    if (!pending) throw new Error("missing request");

    await expect(service.approveRequest(guest.view.user.id, pending.id)).rejects.toThrow(/available|owner/i);
    const stranger = await service.signup({ firstName: "Sam", email: "sam@home.test", password: "correct-horse" });
    await service.createHousehold(stranger.view.user.id, "Other Street");
    await expect(service.approveRequest(stranger.view.user.id, pending.id)).rejects.toThrow(/not pending/i);
    expect(store.activeMemberForUser(guest.view.user.id)).toBeUndefined();

    await service.approveRequest(owner.view.user.id, pending.id);
    expect((await service.sessionView(owner.token))?.workspace?.defaultViewerBps).toBe(5000);
    const saved = await service.saveWorkspace(owner.view.user.id, workspace());
    const guestView = await service.sessionView(guest.token);
    expect(guestView?.household?.name).toBe("Maple Street");
    expect(guestView?.role).toBe("member");
    expect(guestView?.workspace).toEqual(saved);
    await expect(service.saveWorkspace(stranger.view.user.id, workspace("Other Street"))).resolves.toBeTruthy();
    expect((await service.sessionView(guest.token))?.workspace?.householdName).toBe("Maple Street");
    await expect(service.listRequests(guest.view.user.id)).rejects.toThrow(/owner/i);
  });

  it("rejects expired and revoked links", async () => {
    const clock = serviceAt();
    const owner = await clock.service.signup({ firstName: "Alex", email: "alex@home.test", password: "correct-horse" });
    await clock.service.createHousehold(owner.view.user.id, "Maple Street");
    const invite = await clock.service.createInvitation(owner.view.user.id);
    const guest = await clock.service.signup({ firstName: "Jordan", email: "jordan@home.test", password: "correct-horse" });
    clock.advanceDays(8);
    await expect(clock.service.previewInvitation(invite.token)).rejects.toThrow(/no longer available/i);
    await expect(clock.service.requestToJoin(guest.view.user.id, invite.token)).rejects.toThrow(/no longer available/i);

    const fresh = await clock.service.createInvitation(owner.view.user.id);
    await clock.service.revokeInvitation(owner.view.user.id, fresh.invitation.id);
    await expect(clock.service.requestToJoin(guest.view.user.id, fresh.token)).rejects.toThrow(/no longer available/i);
    await expect(clock.service.revokeInvitation(guest.view.user.id, fresh.invitation.id)).rejects.toThrow(/owner|available/i);
  });
});

describe("http sessions", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("sets an httpOnly cookie and clears it on logout", async () => {
    const app = createApp(createService(new MemoryStore(), { passwordRounds: rounds }));
    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    const base = `http://127.0.0.1:${address.port}`;

    const signup = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Alex", email: "alex@home.test", password: "correct-horse" }),
    });
    const cookie = signup.headers.get("set-cookie") ?? "";
    expect(signup.status).toBe(201);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/correct-horse/);
    const body = await signup.json();
    expect(JSON.stringify(body)).not.toMatch(/token/);

    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    const secureSignup = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Sam", email: "sam@home.test", password: "correct-horse" }),
    });
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    expect(secureSignup.headers.get("set-cookie") ?? "").toMatch(/Secure/i);

    const logout = await fetch(`${base}/api/logout`, { method: "POST", headers: { cookie } });
    expect(logout.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    const session = await fetch(`${base}/api/session`, { headers: { cookie } });
    expect(await session.json()).toEqual({ session: null });
  });
});
