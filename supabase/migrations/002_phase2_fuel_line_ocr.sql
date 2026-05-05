-- ============================================================
-- Phase 2 Migration: Fuel Events, LINE Messages, OCR Results
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

-- ── fuel_events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID,
  driver_id         UUID NOT NULL,
  trip_id           UUID,
  status            TEXT NOT NULL DEFAULT 'waiting_data' CHECK (status IN (
                      'waiting_data', 'waiting_ocr', 'needs_review',
                      'waiting_approval', 'waiting_payment', 'paid'
                    )),
  -- Photo paths (Supabase Storage)
  photo_pump_url      TEXT,
  photo_payment_url   TEXT,
  photo_odometer_url  TEXT,
  -- OCR Results
  station_name        TEXT,
  amount_baht         NUMERIC(10,2),
  fuel_liters         NUMERIC(8,3),
  price_per_liter     NUMERIC(8,2),
  odometer            NUMERIC(10,2),
  payment_method      TEXT,
  ocr_confidence      NUMERIC(5,4),
  -- Approval
  verified_by         UUID,
  verified_at         TIMESTAMPTZ,
  paid_by             UUID,
  paid_at             TIMESTAMPTZ,
  -- Anomaly
  is_anomaly          BOOLEAN DEFAULT false,
  anomaly_reason      TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- ── line_messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS line_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id          TEXT NOT NULL,
  driver_id             UUID,
  message_type          TEXT CHECK (message_type IN ('text', 'image', 'location', 'sticker')),
  content               TEXT,
  image_url             TEXT,
  intent                TEXT CHECK (intent IN (
                          'fuel_photo', 'advance_request', 'odometer',
                          'job_accept', 'unknown'
                        )),
  processed             BOOLEAN DEFAULT false,
  fuel_event_id         UUID,
  advance_request_id    UUID,
  raw_payload           JSONB,
  received_at           TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ── ocr_results ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocr_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_event_id    UUID,
  image_url        TEXT NOT NULL,
  image_type       TEXT CHECK (image_type IN ('pump', 'payment', 'odometer')),
  raw_response     JSONB,
  extracted_data   JSONB,
  confidence       NUMERIC(5,4),
  model_used       TEXT DEFAULT 'gpt-4o',
  tokens_used      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── advance_requests (create if not exists from Phase 1) ──────
CREATE TABLE IF NOT EXISTS advance_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         UUID NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'approved', 'rejected', 'paid'
                    )),
  requested_via     TEXT DEFAULT 'line',
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  paid_by           UUID,
  paid_at           TIMESTAMPTZ,
  month_year        TEXT NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fuel_events_driver    ON fuel_events(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_events_status    ON fuel_events(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_events_job       ON fuel_events(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_events_created   ON fuel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_messages_user    ON line_messages(line_user_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_driver  ON line_messages(driver_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_event     ON ocr_results(fuel_event_id);
CREATE INDEX IF NOT EXISTS idx_advances_driver       ON advance_requests(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_advances_status       ON advance_requests(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_advances_month        ON advance_requests(driver_id, month_year);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fuel_events_updated_at
  BEFORE UPDATE ON fuel_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER advance_requests_updated_at
  BEFORE UPDATE ON advance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS Policies ──────────────────────────────────────────────
ALTER TABLE fuel_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_requests   ENABLE ROW LEVEL SECURITY;

-- fuel_events: any authenticated user can read/write
CREATE POLICY "staff_all_fuel" ON fuel_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- line_messages: any authenticated user can read (written by service role)
CREATE POLICY "staff_read_line_messages" ON line_messages
  FOR SELECT TO authenticated USING (true);

-- ocr_results: any authenticated user can read (written by service role)
CREATE POLICY "staff_read_ocr" ON ocr_results
  FOR SELECT TO authenticated USING (true);

-- advance_requests: any authenticated user can read/write
CREATE POLICY "staff_all_advances" ON advance_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
