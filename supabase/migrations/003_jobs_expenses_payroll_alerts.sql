-- ============================================================
-- Phase 1+2 Remaining: Jobs, Expenses, Payroll, Alerts
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

-- ── jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number          TEXT UNIQUE,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id         UUID,
  origin              TEXT NOT NULL,
  destination         TEXT NOT NULL,
  product             TEXT,
  weight_kg           NUMERIC(10,2),
  selling_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  source              TEXT NOT NULL DEFAULT 'bank' CHECK (source IN ('bank','mother','driver','ai')),
  payment_type        TEXT NOT NULL DEFAULT 'on_completion'
                        CHECK (payment_type IN ('prepaid','on_completion','credit')),
  payment_due_date    DATE,
  assigned_driver_id  UUID,
  status              TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN (
                          'new','waiting_driver','assigned','driver_accepted',
                          'in_progress','delivered','waiting_payment','closed'
                        )),
  trip_id             UUID,
  fuel_event_id       UUID,
  profit              NUMERIC(10,2),
  notes               TEXT,
  created_by          UUID,
  closed_by           UUID,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- Auto job_number trigger
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := 'JOB-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
                      LPAD((nextval('job_number_seq'))::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS job_number_seq START 1;

CREATE TRIGGER jobs_number_trigger
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION generate_job_number();

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── expenses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID,
  trip_id       UUID,
  driver_id     UUID,
  category      TEXT NOT NULL CHECK (category IN (
                  'fuel','toll','repair','food','parking',
                  'advance','other'
                )),
  description   TEXT,
  amount        NUMERIC(10,2) NOT NULL,
  receipt_url   TEXT,
  recorded_by   UUID,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── payrolls ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payrolls (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID NOT NULL,
  month_year          TEXT NOT NULL,
  base_salary         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_commission    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_advance       NUMERIC(10,2) NOT NULL DEFAULT 0,
  social_security     NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_additions     NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_pay           NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_pay             NUMERIC(10,2) NOT NULL DEFAULT 0,
  trip_count          INTEGER NOT NULL DEFAULT 0,
  total_distance      NUMERIC(10,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','approved','paid')),
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  paid_by             UUID,
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(driver_id, month_year)
);

CREATE TRIGGER payrolls_updated_at
  BEFORE UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── alerts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN (
                  'fuel_anomaly','route_anomaly','low_profit',
                  'overdue_customer','advance_over_limit','system'
                )),
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  driver_id     UUID,
  job_id        UUID,
  fuel_event_id UUID,
  customer_id   UUID,
  is_read       BOOLEAN DEFAULT false,
  read_by       UUID,
  read_at       TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_status        ON jobs(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_driver        ON jobs(assigned_driver_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_customer      ON jobs(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_date          ON jobs(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_job       ON expenses(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_driver    ON expenses(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_date      ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_payrolls_driver    ON payrolls(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payrolls_month     ON payrolls(month_year);
CREATE INDEX IF NOT EXISTS idx_alerts_type        ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_read        ON alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_created     ON alerts(created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_jobs"      ON jobs     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_expenses"  ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_payrolls"  ON payrolls FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_alerts"    ON alerts   FOR ALL TO authenticated USING (true) WITH CHECK (true);
