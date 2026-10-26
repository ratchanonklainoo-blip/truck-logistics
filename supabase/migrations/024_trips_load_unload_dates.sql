-- Migration 024: วันที่ขึ้นของ / วันที่ลงของ ของแต่ละเที่ยว (CEO 2026-10-26)
-- เพิ่มคอลัมน์ nullable + CHECK เท่านั้น ไม่แก้/ไม่ backfill ข้อมูลเดิม ; รันซ้ำได้
--   trips.load_date   : วันที่รับของขึ้นรถ (ว่าง = ไม่ได้บันทึก)
--   trips.unload_date : วันที่ลงของปลายทาง (ว่าง = ไม่ได้บันทึก)
--   ห้ามวันที่ลงก่อนวันที่ขึ้น (ตรวจเฉพาะเมื่อมีทั้งสองค่า) — แถวเดิมเป็น NULL ทั้งคู่จึงผ่าน CHECK
-- RLS: ไม่เปลี่ยน — policy ของ trips เป็นระดับแถว/ตาราง ครอบคอลัมน์ใหม่อัตโนมัติ

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS load_date   date;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS unload_date date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.trips'::regclass AND conname = 'trips_unload_not_before_load') THEN
    ALTER TABLE public.trips ADD CONSTRAINT trips_unload_not_before_load
      CHECK (load_date IS NULL OR unload_date IS NULL OR unload_date >= load_date);
  END IF;
END $$;

-- ตัวกรองช่วงวันที่ขึ้น/ลงในหน้าเที่ยววิ่ง (ต่อคนขับ)
CREATE INDEX IF NOT EXISTS idx_trips_driver_load_date   ON public.trips(driver_id, load_date);
CREATE INDEX IF NOT EXISTS idx_trips_driver_unload_date ON public.trips(driver_id, unload_date);

COMMENT ON COLUMN public.trips.load_date   IS 'วันที่รับของขึ้นรถ; NULL = ไม่ได้บันทึก';
COMMENT ON COLUMN public.trips.unload_date IS 'วันที่ลงของปลายทาง; NULL = ไม่ได้บันทึก; ต้องไม่ก่อน load_date';
