-- Migration 023: เดือนที่เริ่มคิดเงินเดือนฐาน (ทดลองงาน) (CEO 2026-10-06)
-- เพิ่มคอลัมน์ nullable เท่านั้น ไม่แก้/ไม่ backfill ข้อมูลเดิม (ไม่ใส่ค่าให้คนขับคนใด) ; รันซ้ำได้
--   drivers.base_salary_start : วันที่ 1 ของเดือนที่เริ่มคิดเงินเดือนฐาน
--     มีค่า  → เดือนก่อนหน้าเดือนนี้ ไม่มีฐานและไม่หักประกันสังคม (มีแต่ค่าเที่ยว); เดือนนี้เป็นต้นไปฐานเต็ม
--     ว่าง   → ใช้กติกา start_date เดิม (เริ่มหลังวันที่ 1 → เดือนนั้นไม่มีฐาน)
-- RLS: ไม่เปลี่ยน (คอลัมน์ใหม่อยู่ใต้ policy ของตาราง drivers เดิม)

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS base_salary_start date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'drivers_base_salary_start_first_day' AND conrelid = 'public.drivers'::regclass
  ) THEN
    ALTER TABLE public.drivers ADD CONSTRAINT drivers_base_salary_start_first_day
      CHECK (base_salary_start IS NULL OR EXTRACT(DAY FROM base_salary_start) = 1);
  END IF;
END $$;

COMMENT ON COLUMN public.drivers.base_salary_start IS
  'วันที่ 1 ของเดือนที่เริ่มคิดเงินเดือนฐาน; เดือนก่อนหน้า = ฐาน 0 ไม่หักประกันสังคม; NULL = ใช้กติกา start_date';
