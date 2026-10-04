-- ============================================================
-- Migration 016: เที่ยววิ่งประจำ (recurring_routes)
-- แม่แบบสถานที่/เส้นทางประจำ — เลือกแม่แบบ + วันที่ + ทะเบียนรถ + ค่าเที่ยว
-- แล้วระบบสร้างแถวใน trips ให้ (ไม่แตะตาราง trips / payroll / payslip เดิม)
-- RLS: authenticated เท่านั้น (เหมือน trips/app_settings)
-- ============================================================

CREATE TABLE IF NOT EXISTS recurring_routes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  origin                  TEXT NOT NULL,
  destination             TEXT NOT NULL,
  product                 TEXT NOT NULL DEFAULT '',
  default_transport_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by              UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  CONSTRAINT recurring_routes_name_not_blank        CHECK (length(btrim(name)) > 0),
  CONSTRAINT recurring_routes_origin_not_blank      CHECK (length(btrim(origin)) > 0),
  CONSTRAINT recurring_routes_destination_not_blank CHECK (length(btrim(destination)) > 0),
  CONSTRAINT recurring_routes_price_non_negative    CHECK (default_transport_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_recurring_routes_active
  ON recurring_routes (created_at) WHERE deleted_at IS NULL;

ALTER TABLE recurring_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON recurring_routes;
CREATE POLICY "authenticated_full_access" ON recurring_routes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_recurring_routes_updated_at ON recurring_routes;
CREATE TRIGGER trg_recurring_routes_updated_at
  BEFORE UPDATE ON recurring_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
