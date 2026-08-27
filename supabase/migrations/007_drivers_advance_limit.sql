-- ============================================================
-- Migration 007: Add monthly_advance_limit to drivers
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
-- ============================================================

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS monthly_advance_limit NUMERIC(10,2) NOT NULL DEFAULT 5000;

-- Refresh schema cache hint: no-op update
COMMENT ON COLUMN drivers.monthly_advance_limit IS 'วงเบิก/เดือน (บาท)';
