-- ============================================================
-- Jobs Nearby (งานใกล้รถพ่วง) — Phase 1: schema only
-- อ้างอิงเอกสารออกแบบ DESIGN_JOBS_NEARBY_dev1.md (อนุมัติ 2026-08-30)
-- ============================================================

-- ── jobs: เพิ่มพิกัดต้นทาง/ปลายทาง (nullable, ไม่กระทบงานเก่า) ──
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS origin_lat       NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS origin_lng       NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS destination_lat  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS destination_lng  NUMERIC(9,6);

-- ── truck_locations: ประวัติพิกัดสดของรถแต่ละคัน (ผูกกับ driver_id) ──
CREATE TABLE IF NOT EXISTS truck_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES drivers(id),
  lat          NUMERIC(9,6) NOT NULL,
  lng          NUMERIC(9,6) NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK (source IN ('gpsiam','line_share','manual')),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truck_locations_driver_time
  ON truck_locations (driver_id, recorded_at DESC);

ALTER TABLE truck_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "truck_locations_all" ON truck_locations;
CREATE POLICY "truck_locations_all" ON truck_locations
  FOR ALL USING (auth.role() = 'authenticated');
