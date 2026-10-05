-- Migration 020: anon/public อ่านอย่างเดียว, authenticated เต็มสิทธิ์ (CEO อนุมัติ 2026-10-05)
-- ตาราง: route_prices, customer_payments, import_lots, shipping_suppliers, shipping_documents, ns_shop_jobs
-- เดิมทุกตารางมี policy เดียว "<tbl>_all" FOR ALL TO public USING (true) → anon แก้/ลบ/เพิ่มได้
-- ไม่แตะ trips, storage และตารางอื่น ; รันซ้ำได้ (idempotent)

BEGIN;

DO $$
DECLARE
  t   text;
  old text;
BEGIN
  FOREACH t IN ARRAY ARRAY['route_prices','customer_payments','import_lots',
                           'shipping_suppliers','shipping_documents','ns_shop_jobs'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip %, table not found', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 1) สร้างสิทธิ์ authenticated เต็มก่อน แอปที่ล็อกอินจะไม่พังระหว่างเปลี่ยน
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
                   t || '_authenticated_all', t);

    -- 2) ลบ policy public FOR ALL เดิม
    FOR old IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'ALL' AND 'public' = ANY(roles)
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old, t);
    END LOOP;

    -- 3) public (รวม anon) อ่านได้อย่างเดียว
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)',
                   t || '_public_read', t);
  END LOOP;
END $$;

COMMIT;
