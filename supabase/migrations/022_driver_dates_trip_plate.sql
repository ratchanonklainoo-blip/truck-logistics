-- Migration 022: วันเริ่ม/สิ้นสุดงานของคนขับ + ทะเบียนรถที่ใช้ในแต่ละเที่ยว (CEO 2026-10-05)
-- เพิ่มคอลัมน์ nullable เท่านั้น ไม่แก้/ไม่ backfill ข้อมูลเดิม ; รันซ้ำได้
--   drivers.start_date : เริ่มงานหลังวันที่ 1 ของเดือน → เดือนนั้นไม่มีเงินเดือนฐาน/ไม่หักประกันสังคม (ว่าง = ฐานเต็มตามเดิม)
--   drivers.end_date   : วันสุดท้ายที่ทำงาน (ตั้งตอนปิดใช้งาน) → ไม่สร้างใบเงินเดือนเดือนหลังจากนั้น
--   trips.plate        : ทะเบียนรถของเที่ยวนั้น (ว่าง = ใช้ทะเบียนของคนขับ)

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE public.trips   ADD COLUMN IF NOT EXISTS plate      text;

COMMENT ON COLUMN public.drivers.start_date IS 'วันเริ่มงาน; เริ่มหลังวันที่ 1 → เดือนนั้นฐาน 0 และไม่หักประกันสังคม';
COMMENT ON COLUMN public.drivers.end_date   IS 'วันสุดท้ายที่ทำงาน (ปิดใช้งาน); ไม่สร้างใบเงินเดือนเดือนหลังจากนี้';
COMMENT ON COLUMN public.trips.plate        IS 'ทะเบียนรถที่ใช้ในเที่ยวนี้; NULL = ใช้ drivers.license_plate';
