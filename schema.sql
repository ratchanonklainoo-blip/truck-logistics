-- ============================================================
-- Truck Logistics OS — หจก.ณสิริทรัพย์ การเกษตร
-- Supabase PostgreSQL Schema — Phase 1
-- วิธีใช้: Copy ทั้งหมดนี้ → วางใน Supabase SQL Editor → Run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- DRIVERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_key      TEXT NOT NULL UNIQUE, -- 'jong', 'phoom' etc.
  name            TEXT NOT NULL,
  nickname        TEXT NOT NULL,
  license_plate   TEXT NOT NULL,
  bank_account    TEXT,
  social_security INTEGER NOT NULL DEFAULT 0,
  base_salary     INTEGER NOT NULL DEFAULT 5000,
  commission_rate NUMERIC(4,2) NOT NULL DEFAULT 0.10,
  line_user_id    TEXT,               -- สำหรับ LINE Bot Phase 2
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ─────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  address         TEXT,
  payment_type    TEXT NOT NULL DEFAULT 'on_completion'
                  CHECK (payment_type IN ('prepaid','on_completion','credit')),
  credit_days     INTEGER,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ─────────────────────────────────────────
-- TRIPS (เที่ยววิ่ง) — core table, same as old system
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES drivers(id),
  customer_id     UUID REFERENCES customers(id),
  date            DATE NOT NULL,
  origin          TEXT NOT NULL DEFAULT '',
  destination     TEXT NOT NULL DEFAULT '',
  product         TEXT DEFAULT '',
  weight          TEXT DEFAULT '',            -- เก็บเป็น text เช่น "30,000 กก."
  transport_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  trip_pay        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- ค่ารอบ = transport_price * commission_rate
  odometer_start  INTEGER DEFAULT 0,
  odometer_end    INTEGER DEFAULT 0,
  distance        INTEGER DEFAULT 0,         -- คำนวณ odometer_end - odometer_start
  fuel_cost       NUMERIC(12,2) DEFAULT 0,
  fuel_litres     NUMERIC(8,3) DEFAULT 0,
  other_item      TEXT DEFAULT '',
  other_cost      NUMERIC(12,2) DEFAULT 0,
  withdraw        NUMERIC(12,2) DEFAULT 0,   -- เบิกเงิน
  remarks         TEXT DEFAULT '',
  receipt_image_url TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ─────────────────────────────────────────
-- APP SETTINGS (categories, locations, odometer baselines)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- AUDIT LOGS — ทุก create/update/delete บันทึก
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  user_id     UUID,
  user_email  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE drivers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs  ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users เห็นและแก้ไขได้ทั้งหมด
-- (ระบบนี้มีแค่ BankOwner เข้า web — จัดการ RLS แบบ simple)
CREATE POLICY "authenticated_full_access" ON drivers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON trips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_audit" ON audit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_insert_audit" ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─────────────────────────────────────────
-- INDEXES สำหรับ performance
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_driver_id    ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_date         ON trips(date);
CREATE INDEX IF NOT EXISTS idx_trips_deleted_at   ON trips(deleted_at);
CREATE INDEX IF NOT EXISTS idx_trips_driver_date  ON trips(driver_id, date);
CREATE INDEX IF NOT EXISTS idx_drivers_driver_key ON drivers(driver_key);

-- ─────────────────────────────────────────
-- SEED DATA — ข้อมูลเริ่มต้น
-- ─────────────────────────────────────────

-- Insert drivers
INSERT INTO drivers (driver_key, name, nickname, license_plate, bank_account, social_security, base_salary)
VALUES
  ('jong',  'นายไพศาล เมฆอากาศ',  'จง',  '71-1831 - 71-1832 เชียงราย', '0-18-3-54437-3 กสิกรไทย',   435, 5000),
  ('phoom', 'นายภาคภูมิ รักคณะ',   'ภูมิ', '71-1833 - 71-1834 เชียงราย', '174-1-96928-5 กสิกรไทย', 870, 5000)
ON CONFLICT (driver_key) DO NOTHING;

-- Insert default settings
INSERT INTO app_settings (setting_key, setting_value) VALUES
(
  'product_categories',
  '["ข้าวโพดสด","ข้าวโพดแห้ง","ข้าวโพดสับ","ข้าว","มันสำปะหลัง","ยางพารา","อ้อย","ปุ๋ย","ปูนซีเมนต์","หิน","ทราย"]'::jsonb
),
(
  'locations',
  '["เชียงราย","เชียงใหม่","ลำปาง","พะเยา","แพร่","น่าน","ลำพูน","แม่ฮ่องสอน","อุตรดิตถ์","พิษณุโลก","สุโขทัย","เพชรบูรณ์","กำแพงเพชร","นครสวรรค์","ตาก","จุน","ป่าแดด","เชียงคำ","ดอกคำใต้","เทิง","พาน","แม่สอด","กรุงเทพมหานคร","นนทบุรี","ปทุมธานี","สมุทรปราการ","สมุทรสาคร","นครปฐม","พระนครศรีอยุธยา","สระบุรี","ชลบุรี","ระยอง","จันทบุรี","ฉะเชิงเทรา","นครราชสีมา","ขอนแก่น","อุดรธานี","อุบลราชธานี","หนองคาย","แหลมฉบัง","มาบตาพุด","ศรีราชา"]'::jsonb
),
(
  'initial_odometers',
  '{"jong": 0, "phoom": 0}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- ─────────────────────────────────────────
-- STORAGE BUCKET สำหรับรูปใบเสร็จ
-- ─────────────────────────────────────────
-- (ทำใน Supabase Dashboard: Storage → New Bucket → "receipts" → Public: false)
-- หรือ run ใน SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_upload_receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "authenticated_read_receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "authenticated_delete_receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts');

-- ─────────────────────────────────────────
-- REALTIME — enable สำหรับ trips table
-- ─────────────────────────────────────────
-- (เปิดใน Supabase Dashboard: Database → Replication → trips ✓)
-- หรือ:
ALTER PUBLICATION supabase_realtime ADD TABLE trips;

-- ============================================================
-- Schema สร้างเสร็จแล้ว!
-- ขั้นตอนต่อไป: ดู SETUP_GUIDE.md
-- ============================================================
