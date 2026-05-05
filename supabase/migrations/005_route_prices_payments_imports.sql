-- ============================================================
-- Migration 005: route_prices, customer_payments, import_lots
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. ตารางราคาเส้นทาง (Route Price Memory)
CREATE TABLE IF NOT EXISTS route_prices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin            TEXT NOT NULL,
  destination       TEXT NOT NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  agreed_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_route_prices_route
  ON route_prices(origin, destination) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_route_prices_customer
  ON route_prices(customer_id) WHERE deleted_at IS NULL;

ALTER TABLE route_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route_prices_all" ON route_prices FOR ALL USING (true);

-- 2. ตารางการชำระเงินลูกค้า (Customer Payments)
CREATE TABLE IF NOT EXISTS customer_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id) ON DELETE CASCADE,
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    TEXT NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','transfer','cheque','other')),
  reference_no      TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_job
  ON customer_payments(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer
  ON customer_payments(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_payments_date
  ON customer_payments(payment_date DESC) WHERE deleted_at IS NULL;

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_payments_all" ON customer_payments FOR ALL USING (true);

-- 3. ตารางล็อตนำเข้าสินค้า (Import Lots / ชิปปิ้ง)
CREATE TABLE IF NOT EXISTS import_lots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number          TEXT NOT NULL,
  product_type        TEXT NOT NULL,   -- ข้าวโพด, มันสำปะหลัง, ฯลฯ
  origin_country      TEXT NOT NULL DEFAULT 'เมียนมา',
  border_crossing     TEXT,            -- ด่านชายแดน
  supplier            TEXT,
  weight_tons         NUMERIC(10,3) NOT NULL DEFAULT 0,
  cost_per_ton        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost          NUMERIC(14,2) GENERATED ALWAYS AS (weight_tons * cost_per_ton) STORED,
  selling_price_per_ton NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_revenue       NUMERIC(14,2) GENERATED ALWAYS AS (weight_tons * selling_price_per_ton) STORED,
  gross_profit        NUMERIC(14,2) GENERATED ALWAYS AS (weight_tons * (selling_price_per_ton - cost_per_ton)) STORED,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_transit','arrived','delivered','closed')),
  assigned_job_id     UUID REFERENCES jobs(id) ON DELETE SET NULL,
  arrival_date        DATE,
  delivery_date       DATE,
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_lots_status
  ON import_lots(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_import_lots_created
  ON import_lots(created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE import_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_lots_all" ON import_lots FOR ALL USING (true);

-- 4. เพิ่ม column daily_summary_enabled ใน app_settings (ถ้ายังไม่มี)
INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('daily_summary_enabled', 'false'),
  ('daily_summary_time', '"21:00"'),
  ('daily_summary_line_id', 'null')
ON CONFLICT (setting_key) DO NOTHING;

-- 5. updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_route_prices_updated_at
    BEFORE UPDATE ON route_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_customer_payments_updated_at
    BEFORE UPDATE ON customer_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_import_lots_updated_at
    BEFORE UPDATE ON import_lots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
