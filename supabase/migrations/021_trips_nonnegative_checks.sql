-- Migration 021: ค่าขนส่ง/ค่าเที่ยว ห้ามติดลบ (L4) — รันซ้ำได้ ; ไม่แก้ข้อมูลเดิม
-- ตรวจก่อน apply (2026-10-05): ไม่มีแถว transport_price < 0 หรือ trip_pay < 0 (รวมแถวที่ลบแล้ว)
-- NULL ผ่าน CHECK ได้ตามปกติ

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.trips'::regclass AND conname = 'trips_transport_price_nonneg') THEN
    ALTER TABLE public.trips ADD CONSTRAINT trips_transport_price_nonneg CHECK (transport_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.trips'::regclass AND conname = 'trips_trip_pay_nonneg') THEN
    ALTER TABLE public.trips ADD CONSTRAINT trips_trip_pay_nonneg CHECK (trip_pay >= 0);
  END IF;
END $$;
