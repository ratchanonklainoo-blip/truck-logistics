-- ============================================================
-- Migration 012: fuel_events.fuel_date
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
--
-- Quick fuel entry now requires staff to pick the actual fuel-up
-- date up front (not just rely on created_at = "when someone
-- typed it into the app", which can be days later). Backfill
-- existing rows from created_at so odometer lookups ("last
-- reading before this date") work for historical data too.
-- ============================================================

ALTER TABLE fuel_events
  ADD COLUMN IF NOT EXISTS fuel_date DATE;

UPDATE fuel_events
  SET fuel_date = created_at::date
  WHERE fuel_date IS NULL;

ALTER TABLE fuel_events
  ALTER COLUMN fuel_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_fuel_events_driver_date
  ON fuel_events(driver_id, fuel_date) WHERE deleted_at IS NULL;
