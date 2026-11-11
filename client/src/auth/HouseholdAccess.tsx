import { useEffect, useState } from "react";
import { Button } from "../components/ui";

type Invitation = { id: string; createdAt: string; expiresAt: string; revokedAt: string | null };
type JoinRequest = { id: string; firstName: string; email: string; createdAt: string };

async function send(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}

export function HouseholdAccess({ role, onChanged }: { role: "owner" | "member"; onChanged: () => void }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    if (role !== "owner") return;
    const [inviteBody, requestBody] = await Promise.all([
      send("/api/invitations") as Promise<{ invitations: Invitation[] }>,
      send("/api/join-requests") as Promise<{ requests: JoinRequest[] }>,
    ]);
    setInvitations(inviteBody.invitations);
    setRequests(requestBody.requests);
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, [role]);

  if (role !== "owner") {
    return <p className="muted">People in this home share the same bills, balances, and tasks.</p>;
  }

  return (
    <div className="stack">
      <Button
        onClick={() => {
          setMessage(null);
          send("/api/invitations", { method: "POST" })
            .then((body) => {
              const created = body as { token?: string };
              if (!created.token) throw new Error("The invitation link was not created.");
              setLink(`${window.location.origin}/invite/${created.token}`);
              setCopied(false);
              return load();
            })
            .catch((error: Error) => setMessage(error.message));
        }}
      >
        Invite member
      </Button>
      {link ? (
        <div className="invite-link">
          <p className="muted">This link works for 7 days, until you revoke it. Opening it does not add anyone.</p>
          <input readOnly value={link} aria-label="Invitation link" />
          <Button
            tone="secondary"
            onClick={() => {
              navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setMessage("Copy the link manually."));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}
      {invitations.filter((invitation) => !invitation.revokedAt).length > 0 ? (
        <ul className="plain-list">
          {invitations
            .filter((invitation) => !invitation.revokedAt)
            .map((invitation) => (
              <li key={invitation.id}>
                <span>
                  <strong>Invitation</strong>
                  <span className="muted">Expires {new Date(invitation.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </span>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    send(`/api/invitations/${invitation.id}/revoke`, { method: "POST" })
                      .then(() => {
                        if (link) setLink(null);
                        return load();
                      })
                      .catch((error: Error) => setMessage(error.message));
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      ) : null}
      <h3>Pending requests</h3>
      {requests.length === 0 ? <p className="muted">No one is waiting to join.</p> : null}
      <ul className="plain-list">
        {requests.map((request) => (
          <li key={request.id}>
            <span>
              <strong>{request.firstName}</strong>
              <span className="muted">{request.email}</span>
            </span>
            <span className="sheet-actions">
              <Button
                onClick={() => {
                  send(`/api/join-requests/${request.id}/approve`, { method: "POST" })
                    .then(() => {
                      onChanged();
                      return load();
                    })
                    .catch((error: Error) => setMessage(error.message));
                }}
              >
                Approve
              </Button>
              <Button
                tone="ghost"
                onClick={() => {
                  send(`/api/join-requests/${request.id}/reject`, { method: "POST" })
                    .then(load)
                    .catch((error: Error) => setMessage(error.message));
                }}
              >
                Reject
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {message ? <p className="form-error">{message}</p> : null}
    </div>
  );
}
