-- Homi MVP schema.
-- Apply this file only after explicit approval. Phase 1 does not run it.
--
-- Fourteen tables. These four were left out on purpose:
--   login_attempts              rate limiting can wait
--   activity_log                payment and settlement rows are the history
--   recurring_expense_periods   a unique index on the generated expense is enough
--   recurring_task_periods      a unique index on the generated task is enough
--
-- Money is numeric(14,2). The application calculates in integer agorot.
-- Payment status is derived from expense_payments. It is not stored.
-- A soft-deleted generated expense still occupies its month, so it is not created again.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_display_name_present CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_unique UNIQUE (token_hash)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ILS',
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT households_currency_ils CHECK (currency = 'ILS'),
  CONSTRAINT households_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role text NOT NULL,
  default_share_bps integer NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT household_members_unique UNIQUE (household_id, user_id),
  CONSTRAINT household_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT household_members_bps_check CHECK (default_share_bps BETWEEN 0 AND 10000)
);

CREATE INDEX household_members_user_idx ON household_members (user_id);

CREATE TABLE household_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  email text,
  token_hash text NOT NULL,
  invited_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_invitations_token_unique UNIQUE (token_hash),
  CONSTRAINT household_invitations_email_lowercase CHECK (email IS NULL OR email = lower(email))
);

CREATE INDEX household_invitations_household_idx ON household_invitations (household_id);

CREATE TABLE expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_name_unique UNIQUE (household_id, name),
  CONSTRAINT expense_categories_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE recurring_expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  title text NOT NULL,
  category_id uuid NOT NULL REFERENCES expense_categories (id) ON DELETE RESTRICT,
  default_amount numeric(14, 2) NOT NULL,
  frequency_months integer NOT NULL,
  start_year integer NOT NULL,
  start_month integer NOT NULL,
  end_year integer,
  end_month integer,
  default_payer_member_id uuid REFERENCES household_members (id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expenses_amount_positive CHECK (default_amount > 0),
  CONSTRAINT recurring_expenses_frequency_check CHECK (frequency_months IN (1, 2, 3, 6, 12)),
  CONSTRAINT recurring_expenses_start_month_check CHECK (start_month BETWEEN 1 AND 12),
  CONSTRAINT recurring_expenses_end_month_check CHECK (end_month IS NULL OR end_month BETWEEN 1 AND 12),
  CONSTRAINT recurring_expenses_end_pair CHECK ((end_year IS NULL) = (end_month IS NULL)),
  CONSTRAINT recurring_expenses_title_present CHECK (length(btrim(title)) > 0)
);

CREATE TABLE recurring_expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES recurring_expense_templates (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  share_bps integer NOT NULL,
  CONSTRAINT recurring_expense_splits_unique UNIQUE (template_id, member_id),
  CONSTRAINT recurring_expense_splits_bps_check CHECK (share_bps BETWEEN 0 AND 10000)
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  title text NOT NULL,
  category_id uuid NOT NULL REFERENCES expense_categories (id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL,
  billing_year integer NOT NULL,
  billing_month integer NOT NULL,
  due_date date,
  notes text,
  split_mode text NOT NULL DEFAULT 'equal',
  recurring_template_id uuid REFERENCES recurring_expense_templates (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_month_check CHECK (billing_month BETWEEN 1 AND 12),
  CONSTRAINT expenses_year_check CHECK (billing_year BETWEEN 1970 AND 2200),
  CONSTRAINT expenses_split_mode_check CHECK (split_mode IN ('equal', 'percentage')),
  CONSTRAINT expenses_title_present CHECK (length(btrim(title)) > 0)
);

-- Includes soft-deleted rows, so deleting one generated month does not recreate it.
CREATE UNIQUE INDEX expenses_recurring_period_unique
  ON expenses (recurring_template_id, billing_year, billing_month)
  WHERE recurring_template_id IS NOT NULL;

CREATE INDEX expenses_household_period_idx
  ON expenses (household_id, billing_year, billing_month);

CREATE TABLE expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  share_bps integer NOT NULL,
  share_amount numeric(14, 2) NOT NULL,
  CONSTRAINT expense_splits_unique UNIQUE (expense_id, member_id),
  CONSTRAINT expense_splits_bps_check CHECK (share_bps BETWEEN 0 AND 10000),
  CONSTRAINT expense_splits_amount_nonnegative CHECK (share_amount >= 0)
);

CREATE TABLE expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL,
  paid_on date NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT expense_payments_amount_positive CHECK (amount > 0)
);

CREATE INDEX expense_payments_expense_idx ON expense_payments (expense_id);
CREATE INDEX expense_payments_paid_on_idx ON expense_payments (paid_on);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  to_member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL,
  settled_on date NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT settlements_amount_positive CHECK (amount > 0),
  CONSTRAINT settlements_distinct_members CHECK (from_member_id <> to_member_id)
);

CREATE INDEX settlements_household_date_idx ON settlements (household_id, settled_on);

CREATE TABLE recurring_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_member_id uuid REFERENCES household_members (id) ON DELETE RESTRICT,
  frequency text NOT NULL,
  interval_count integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_tasks_frequency_check CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT recurring_tasks_interval_check CHECK (interval_count >= 1),
  CONSTRAINT recurring_tasks_title_present CHECK (length(btrim(title)) > 0)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_member_id uuid REFERENCES household_members (id) ON DELETE RESTRICT,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  recurring_template_id uuid REFERENCES recurring_task_templates (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tasks_status_check CHECK (status IN ('open', 'completed')),
  CONSTRAINT tasks_title_present CHECK (length(btrim(title)) > 0)
);

-- Includes soft-deleted rows, so a removed occurrence is not generated again.
CREATE UNIQUE INDEX tasks_recurring_due_unique
  ON tasks (recurring_template_id, due_date)
  WHERE recurring_template_id IS NOT NULL AND due_date IS NOT NULL;

CREATE INDEX tasks_household_status_idx ON tasks (household_id, status, due_date);
