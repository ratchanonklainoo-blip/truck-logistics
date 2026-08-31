-- ============================================================
-- Migration 015: CHECK constraint ช่วงพิกัด lat/lng
-- ปิดช่องโหว่ที่ Fern QA รอบ 2 พบ (QA_JOBS_NEARBY_FERN_ROUND2.md) —
-- ยิง REST ตรง (ข้าม UI/API route) ยังใส่ lat=999/lng=888 ผ่านได้
-- เพราะ migration 014 ไม่มี CHECK constraint ระดับ DB
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'truck_locations_lat_range'
  ) THEN
    ALTER TABLE truck_locations
      ADD CONSTRAINT truck_locations_lat_range CHECK (lat BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'truck_locations_lng_range'
  ) THEN
    ALTER TABLE truck_locations
      ADD CONSTRAINT truck_locations_lng_range CHECK (lng BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_origin_lat_range'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_origin_lat_range CHECK (origin_lat IS NULL OR origin_lat BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_origin_lng_range'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_origin_lng_range CHECK (origin_lng IS NULL OR origin_lng BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_destination_lat_range'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_destination_lat_range CHECK (destination_lat IS NULL OR destination_lat BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_destination_lng_range'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_destination_lng_range CHECK (destination_lng IS NULL OR destination_lng BETWEEN -180 AND 180);
  END IF;
END $$;
