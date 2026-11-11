import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { ApiError } from "./errors.js";
import { createService, type SessionView } from "./service.js";

const COOKIE = "homi_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;

function cookieToken(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setSessionCookie(res: Response, token: string | null): void {
  const secure =
    process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview" ? "; Secure" : "";
  const base = `${COOKIE}=${token ? encodeURIComponent(token) : ""}; HttpOnly; SameSite=Lax; Path=/${secure}`;
  res.setHeader("Set-Cookie", token ? `${base}; Max-Age=${SESSION_SECONDS}` : `${base}; Max-Age=0`);
}

function catchAsync(run: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    run(req, res).catch(next);
  };
}

export function createApp(service: ReturnType<typeof createService>) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  async function view(req: Request): Promise<SessionView> {
    const session = await service.sessionView(cookieToken(req.header("cookie")));
    if (!session) throw new ApiError(401, "Sign in again.");
    return session;
  }

  app.get("/api/session", catchAsync(async (req, res) => {
    res.json({ session: await service.sessionView(cookieToken(req.header("cookie"))) });
  }));

  app.post("/api/signup", catchAsync(async (req, res) => {
    const result = await service.signup(req.body ?? {});
    setSessionCookie(res, result.token);
    res.status(201).json({ session: result.view });
  }));

  app.post("/api/login", catchAsync(async (req, res) => {
    const result = await service.login(req.body ?? {});
    setSessionCookie(res, result.token);
    res.json({ session: result.view });
  }));

  app.post("/api/logout", catchAsync(async (req, res) => {
    await service.logout(cookieToken(req.header("cookie")));
    setSessionCookie(res, null);
    res.json({ session: null });
  }));

  app.post("/api/households", catchAsync(async (req, res) => {
    const session = await view(req);
    res.status(201).json({ session: await service.createHousehold(session.user.id, String(req.body?.name ?? "")) });
  }));

  app.put("/api/workspace", catchAsync(async (req, res) => {
    const session = await view(req);
    res.json({ workspace: await service.saveWorkspace(session.user.id, req.body) });
  }));

  app.post("/api/invitations", catchAsync(async (req, res) => {
    const session = await view(req);
    res.status(201).json(await service.createInvitation(session.user.id));
  }));

  app.get("/api/invitations", catchAsync(async (req, res) => {
    const session = await view(req);
    res.json({ invitations: await service.listInvitations(session.user.id) });
  }));

  app.post("/api/invitations/:id/revoke", catchAsync(async (req, res) => {
    const session = await view(req);
    await service.revokeInvitation(session.user.id, String(req.params.id));
    res.json({ ok: true });
  }));

  app.get("/api/invitations/preview", catchAsync(async (req, res) => {
    res.json(await service.previewInvitation(String(req.query.token ?? "")));
  }));

  app.post("/api/join-requests", catchAsync(async (req, res) => {
    const session = await view(req);
    res.status(201).json(await service.requestToJoin(session.user.id, String(req.body?.token ?? "")));
  }));

  app.get("/api/join-requests", catchAsync(async (req, res) => {
    const session = await view(req);
    res.json({ requests: await service.listRequests(session.user.id) });
  }));

  app.post("/api/join-requests/:id/approve", catchAsync(async (req, res) => {
    const session = await view(req);
    await service.approveRequest(session.user.id, String(req.params.id));
    res.json({ session: await service.sessionView(cookieToken(req.header("cookie"))) });
  }));

  app.post("/api/join-requests/:id/reject", catchAsync(async (req, res) => {
    const session = await view(req);
    await service.rejectRequest(session.user.id, String(req.params.id));
    res.json({ ok: true });
  }));

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Something went wrong." });
  };
  app.use(onError);
  return app;
}
