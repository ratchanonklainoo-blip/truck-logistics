-- Migration 018: ค่าใช้จ่ายประจำ — ความถี่ (รายเดือน/รายปี), เดือนที่จ่ายรายปี, วันสิ้นสุด (ปิดรายการ)
-- idempotent: รันซ้ำได้ ไม่แก้/ลบข้อมูลเดิม
-- ผลต่อ RLS: ไม่มี — เพิ่มคอลัมน์ในตารางเดิม policy "fixed_expenses_all" (authenticated) ครอบคลุมอยู่แล้ว
-- เคสเดิมไม่เปลี่ยน: ทุกแถวเดิมได้ frequency='monthly', pay_month/end_date = NULL

ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS pay_month SMALLINT;
ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS end_date  DATE;

ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_frequency_check;
ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_frequency_check
  CHECK (frequency IN ('monthly', 'yearly'));

ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_pay_month_check;
ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_pay_month_check
  CHECK (pay_month IS NULL OR pay_month BETWEEN 1 AND 12);

-- pay_month ใช้กับรายปีเท่านั้น
ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_pay_month_yearly_check;
ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_pay_month_yearly_check
  CHECK (pay_month IS NULL OR frequency = 'yearly');

ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_end_date_check;
ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_end_date_check
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

-- รายการเดิมที่หมวด annual (จ่ายรายปี) → ความถี่รายปี (เดือนจ่าย = เดือนของ start_date)
UPDATE fixed_expenses SET frequency = 'yearly' WHERE category = 'annual' AND frequency = 'monthly';
