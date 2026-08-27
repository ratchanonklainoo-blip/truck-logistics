-- ============================================================
-- Migration 011: Document trips.expense_notes (schema drift)
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
--
-- trips.expense_notes (jsonb) already exists on production and is
-- read by src/app/(main)/dashboard/page.tsx and typed in
-- src/types/index.ts, but it was added directly via SQL Editor —
-- no migration file ever created it. This migration backfills the
-- missing record so schema history matches production.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS expense_notes JSONB;
