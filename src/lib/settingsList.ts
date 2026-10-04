// อ่าน/เขียนรายการสตริงใน app_settings (locations, product_categories)
// อ่านค่าล่าสุดจาก DB ทุกครั้งก่อนเขียน แล้วรวมแบบไม่ซ้ำ — ไม่เขียนทับด้วย state เก่า
// ต้องระบุ onConflict: 'setting_key' เสมอ (PK คือ id ถ้าไม่ระบุ upsert จะ INSERT แล้วชน UNIQUE(setting_key) แบบเงียบ ๆ)
import type { SupabaseClient } from '@supabase/supabase-js';

export type SettingListKey = 'locations' | 'product_categories';
export const SETTING_SAVE_ERROR = 'บันทึกรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function mergeList(current: readonly string[], additions: readonly (string | null | undefined)[]): string[] {
  const out = [...current];
  const seen = new Set(out.map(v => v.trim().toLowerCase()));
  for (const raw of additions) {
    const v = (raw ?? '').trim();
    if (!v || v === '-') continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

async function readList(supabase: SupabaseClient, key: SettingListKey): Promise<{ list: string[]; error: string | null }> {
  const { data, error } = await supabase.from('app_settings').select('setting_value').eq('setting_key', key).maybeSingle();
  if (error) return { list: [], error: error.message };
  const v = data?.setting_value;
  return { list: Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [], error: null };
}

// เพิ่มค่าใหม่เข้ารายการ (merge) คืนรายการล่าสุดที่บันทึกแล้ว หรือ error ภาษาไทย
export async function addToSettingList(
  supabase: SupabaseClient, key: SettingListKey, additions: readonly (string | null | undefined)[],
): Promise<{ list: string[] | null; error: string | null }> {
  const cur = await readList(supabase, key);
  if (cur.error) return { list: null, error: SETTING_SAVE_ERROR };
  const merged = mergeList(cur.list, additions);
  if (merged.length === cur.list.length) return { list: cur.list, error: null };
  const { error } = await supabase.from('app_settings')
    .upsert({ setting_key: key, setting_value: merged }, { onConflict: 'setting_key' });
  if (error) return { list: null, error: SETTING_SAVE_ERROR };
  return { list: merged, error: null };
}

// ลบค่าออกจากรายการ (อ่านล่าสุดก่อนแล้วตัดเฉพาะค่านั้น)
export async function removeFromSettingList(
  supabase: SupabaseClient, key: SettingListKey, value: string,
): Promise<{ list: string[] | null; error: string | null }> {
  const cur = await readList(supabase, key);
  if (cur.error) return { list: null, error: SETTING_SAVE_ERROR };
  const next = cur.list.filter(x => x !== value);
  const { error } = await supabase.from('app_settings')
    .upsert({ setting_key: key, setting_value: next }, { onConflict: 'setting_key' });
  if (error) return { list: null, error: SETTING_SAVE_ERROR };
  return { list: next, error: null };
}
