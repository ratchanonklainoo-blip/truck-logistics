-- ============================================================
-- Migration 006: shipping_suppliers, shipping_documents
-- Run in Supabase SQL Editor AFTER migration 005
-- ============================================================

-- 1. ตารางผู้ขายต่างประเทศ (Shipping Suppliers)
CREATE TABLE IF NOT EXISTS shipping_suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  country        TEXT NOT NULL DEFAULT 'เมียนมา',
  contact_name   TEXT,
  phone          TEXT,
  email          TEXT,
  payment_terms  TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE shipping_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_suppliers_all" ON shipping_suppliers FOR ALL USING (true);

-- 2. ตารางเอกสารนำเข้า (Shipping Documents Checklist)
CREATE TABLE IF NOT EXISTS shipping_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID NOT NULL REFERENCES import_lots(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL,
  doc_name       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'received', 'verified')),
  received_date  DATE,
  file_url       TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_documents_lot
  ON shipping_documents(lot_id);
CREATE INDEX IF NOT EXISTS idx_shipping_documents_status
  ON shipping_documents(status);

ALTER TABLE shipping_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_documents_all" ON shipping_documents FOR ALL USING (true);

-- 3. updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER trg_shipping_suppliers_updated_at
    BEFORE UPDATE ON shipping_suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_shipping_documents_updated_at
    BEFORE UPDATE ON shipping_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
