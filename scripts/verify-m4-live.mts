// อ่านอย่างเดียว: เทียบยอดเที่ยววิ่ง "วิธีเดิม" (ดึงทั้งตาราง + กรองเดือนฝั่ง client) กับ "วิธีใหม่" (ดึงช่วงเดือน + .range)
// รัน: node --env-file=.env.local scripts/verify-m4-live.mts
import { createClient } from '@supabase/supabase-js';
import { nextMonthStart } from '../src/lib/dateTh.ts';
import { fetchAllRows } from '../src/lib/fetchAll.ts';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const COLS = 'id,driver_id,date,transport_price,trip_pay,fuel_cost,other_cost,withdraw,distance,fuel_litres';
type Row = { id: string; driver_id: string; date: string } & Record<string, number>;
const MONEY = ['transport_price', 'trip_pay', 'fuel_cost', 'other_cost', 'withdraw', 'distance', 'fuel_litres'];

const old = await sb.from('trips').select(COLS).is('deleted_at', null); // วิธีเดิม (คำขอเดียว)
if (old.error) throw old.error;
const oldRows = old.data as unknown as Row[];
const full = await fetchAllRows<Row>((a, b) => sb.from('trips').select(COLS).is('deleted_at', null).order('id').range(a, b) as never);
console.log(`แถวทั้งหมด: วิธีเดิมได้ ${oldRows.length}, แบ่งหน้าได้ ${full.data.length}`);

const months = [...new Set(oldRows.map(r => r.date.slice(0, 7)))].sort();
let mismatch = 0;
for (const ym of months) {
  const [y, m] = ym.split('-').map(Number);
  const oldMonth = oldRows.filter(r => { const d = new Date(r.date + 'T00:00:00'); return d.getMonth() === m - 1 && d.getFullYear() === y; });
  const neu = await fetchAllRows<Row>((a, b) => sb.from('trips').select(COLS).is('deleted_at', null)
    .gte('date', `${ym}-01`).lt('date', nextMonthStart(ym)).order('id').range(a, b) as never);
  if (neu.error) throw neu.error;
  const oldIds = oldMonth.map(r => r.id).sort().join(), newIds = neu.data.map(r => r.id).sort().join();
  if (oldIds !== newIds) { mismatch++; console.log(`${ym}: ชุดแถวไม่ตรงกัน`); }
  const drivers = new Set([...oldMonth, ...neu.data].map(r => r.driver_id));
  const line: string[] = [];
  for (const k of MONEY) {
    const o = oldMonth.reduce((s, r) => s + Number(r[k] || 0), 0);
    const n = neu.data.reduce((s, r) => s + Number(r[k] || 0), 0);
    if (Math.abs(o - n) > 1e-6) { mismatch++; line.push(`${k} ${o}≠${n}`); }
  }
  for (const did of drivers) { // ต่อคนขับ (หน้าเที่ยววิ่ง/สลิป ดึงรายคน)
    for (const k of MONEY) {
      const o = oldMonth.filter(r => r.driver_id === did).reduce((s, r) => s + Number(r[k] || 0), 0);
      const n = neu.data.filter(r => r.driver_id === did).reduce((s, r) => s + Number(r[k] || 0), 0);
      if (Math.abs(o - n) > 1e-6) { mismatch++; line.push(`${did.slice(0, 8)} ${k} ${o}≠${n}`); }
    }
  }
  const rev = neu.data.reduce((s, r) => s + Number(r.transport_price || 0), 0);
  console.log(`${ym}: แถว ${oldMonth.length}/${neu.data.length} ค่าขนส่ง ${rev.toLocaleString()} ${line.length ? 'ไม่ตรง: ' + line.join('; ') : 'ตรงทุกบาท'}`);
}
console.log(mismatch ? `ไม่ตรง ${mismatch} จุด` : 'ผล: ตรงทุกเดือน ทุกคนขับ ทุกบาท');
process.exit(mismatch ? 1 : 0);
