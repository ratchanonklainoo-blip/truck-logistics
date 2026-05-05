-- ============================================================
-- LINE Command Session State
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

-- Stores multi-step conversation state per LINE user
CREATE TABLE IF NOT EXISTS line_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id  TEXT NOT NULL,
  driver_id     UUID,           -- resolved driver (may be null until resolved)
  state         TEXT NOT NULL,  -- 'fuel_waiting_data' | 'advance_waiting_data'
  data          JSONB DEFAULT '{}',  -- accumulated conversation data
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Only keep latest non-expired session per user
CREATE INDEX IF NOT EXISTS idx_line_sessions_user
  ON line_sessions(line_user_id, expires_at DESC);

-- Auto-cleanup: sessions older than 15 minutes can be ignored
-- (expires_at enforced in application layer)

-- RLS
ALTER TABLE line_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_line_sessions"
  ON line_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add entered_via to fuel_events (track how it was created)
ALTER TABLE fuel_events
  ADD COLUMN IF NOT EXISTS entered_via TEXT DEFAULT 'line_photo'
    CHECK (entered_via IN ('line_photo', 'line_command', 'manual'));
