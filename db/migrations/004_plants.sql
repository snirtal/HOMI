-- Household plants and watering history.
-- Apply this file only after explicit approval. Do not run it against Neon from the app.
--
-- Homi uses Neon PostgreSQL as its only database. This file is not for any other database.
-- Plants are not part of the workspace snapshot. Photos stay in PostgreSQL.
-- The next watering date is not stored. It is the latest watered_on plus interval_days.

CREATE TABLE IF NOT EXISTS plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name text NOT NULL,
  interval_days integer NOT NULL,
  photo bytea NOT NULL,
  photo_content_type text NOT NULL DEFAULT 'image/jpeg',
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT plants_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT plants_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT plants_interval_check CHECK (interval_days BETWEEN 1 AND 365),
  CONSTRAINT plants_photo_type_check CHECK (photo_content_type = 'image/jpeg'),
  CONSTRAINT plants_photo_size_check CHECK (octet_length(photo) BETWEEN 1 AND 409600)
);

CREATE INDEX IF NOT EXISTS plants_household_idx
  ON plants (household_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS plant_waterings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plants (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  watered_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plant_waterings_plant_idx
  ON plant_waterings (plant_id, watered_on DESC, created_at DESC);
