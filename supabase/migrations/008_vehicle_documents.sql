-- ============================================================
-- Migration 008: Vehicle Documents System
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

-- ── vehicle_documents ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_license_plate TEXT NOT NULL,
  doc_type            TEXT NOT NULL CHECK (doc_type IN (
                        'power_of_attorney',  -- หนังสือมอบอำนาจ
                        'cross_border',       -- หนังสือข้ามแดน
                        'vehicle_reg',        -- ทะเบียนรถ
                        'insurance',          -- ประกันภัย
                        'other'
                      )),
  doc_name            TEXT NOT NULL,
  file_url            TEXT,
  file_path           TEXT,   -- Supabase Storage path
  valid_from          DATE,
  valid_until         DATE,
  notes               TEXT,
  uploaded_by         UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS vehicle_documents_updated_at ON vehicle_documents;
CREATE TRIGGER vehicle_documents_updated_at
  BEFORE UPDATE ON vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_documents_all" ON vehicle_documents;
CREATE POLICY "vehicle_documents_all" ON vehicle_documents
  FOR ALL USING (auth.role() = 'authenticated');

-- ── employment_contracts (audit trail) ───────────────────────
CREATE TABLE IF NOT EXISTS employment_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL,
  driver_name     TEXT NOT NULL,
  license_plate   TEXT,
  start_date      DATE NOT NULL,
  base_salary     NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(4,2) NOT NULL DEFAULT 0.10,
  bank_name       TEXT,
  bank_account    TEXT,
  max_liability   NUMERIC(10,2),
  work_schedule   TEXT,
  generated_by    UUID REFERENCES auth.users(id),
  generated_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS employment_contracts_updated_at ON employment_contracts;
CREATE TRIGGER employment_contracts_updated_at
  BEFORE UPDATE ON employment_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employment_contracts_all" ON employment_contracts;
CREATE POLICY "employment_contracts_all" ON employment_contracts
  FOR ALL USING (auth.role() = 'authenticated');

-- ── termination_records (audit trail) ────────────────────────
CREATE TABLE IF NOT EXISTS termination_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         UUID NOT NULL,
  driver_name       TEXT NOT NULL,
  termination_date  DATE NOT NULL,
  last_work_date    DATE,
  reason            TEXT NOT NULL,
  final_salary      NUMERIC(10,2) NOT NULL DEFAULT 0,
  compensation      NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  generated_by      UUID REFERENCES auth.users(id),
  generated_at      TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS termination_records_updated_at ON termination_records;
CREATE TRIGGER termination_records_updated_at
  BEFORE UPDATE ON termination_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE termination_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "termination_records_all" ON termination_records;
CREATE POLICY "termination_records_all" ON termination_records
  FOR ALL USING (auth.role() = 'authenticated');
