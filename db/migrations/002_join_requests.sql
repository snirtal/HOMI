-- Owner approval for invitation links.
-- Apply this file only after explicit approval. Do not run it against Neon from the app.
--
-- A link stays valid until expires_at or revoked_at.
-- Opening a link does not consume it and does not create a membership.
-- household_invitations.accepted_at is unused. Membership is inserted only when
-- an owner approves a row in household_join_requests.

ALTER TABLE household_invitations
  ADD COLUMN revoked_at timestamptz;

COMMENT ON COLUMN household_invitations.accepted_at IS
  'Unused. A link is not consumed by a visit or a join request.';

CREATE TABLE household_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL REFERENCES household_invitations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT household_join_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT household_join_requests_decision_check CHECK (
    (status = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (status IN ('approved', 'rejected') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX household_join_requests_one_pending
  ON household_join_requests (household_id, user_id)
  WHERE status = 'pending';

CREATE INDEX household_join_requests_household_idx
  ON household_join_requests (household_id, status);
