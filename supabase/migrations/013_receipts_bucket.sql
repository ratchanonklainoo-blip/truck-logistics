-- ============================================================
-- Migration 013: receipts storage bucket
-- หจก.ณสิริทรัพย์ การเกษตร — Truck Logistics OS
--
-- Quick fuel entry (src/app/(main)/fuel/page.tsx) uploads compressed
-- photos to Supabase Storage bucket "receipts" and reads them back via
-- signed URL. The bucket was documented in schema.sql but never
-- actually created on the project — this creates it for real, private
-- (signed-URL-only), with policies scoped to authenticated staff.
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'authenticated_upload_receipts'
  ) then
    create policy "authenticated_upload_receipts" on storage.objects
      for insert to authenticated with check (bucket_id = 'receipts');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'authenticated_read_receipts'
  ) then
    create policy "authenticated_read_receipts" on storage.objects
      for select to authenticated using (bucket_id = 'receipts');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'authenticated_delete_receipts'
  ) then
    create policy "authenticated_delete_receipts" on storage.objects
      for delete to authenticated using (bucket_id = 'receipts');
  end if;
end $$;
