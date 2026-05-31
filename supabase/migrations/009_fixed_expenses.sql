-- ============================================================
-- Migration 009: Fixed Monthly Expenses
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN (
                        'insurance',      -- ประกันภัย
                        'installment',    -- ค่างวด
                        'maintenance',    -- ค่าบำรุงรักษา
                        'tax',            -- ภาษีรถ
                        'other'           -- อื่นๆ
                      )),
  truck_license_plate TEXT,               -- NULL = applies to all trucks / company-wide
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Installment tracking (NULL = not an installment)
  total_installments  INT,
  paid_installments   INT NOT NULL DEFAULT 0,
  start_date          DATE,
  -- Recurring config
  due_day             INT CHECK (due_day BETWEEN 1 AND 31),  -- day of month payment is due
  is_active           BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS fixed_expenses_updated_at ON fixed_expenses;
CREATE TRIGGER fixed_expenses_updated_at
  BEFORE UPDATE ON fixed_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_expenses_all" ON fixed_expenses;
CREATE POLICY "fixed_expenses_all" ON fixed_expenses
  FOR ALL USING (auth.role() = 'authenticated');
