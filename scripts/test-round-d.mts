// รัน: node scripts/test-round-d.mts   (Node 22.18+ รองรับ .ts โดยตรง)
// ตรรกะของงานรอบ D: วันที่เวลาไทย, ขอบเดือน, ปิดงานเมื่อรับเงินครบ, แบ่งหน้า .range
import test from 'node:test';
import assert from 'node:assert/strict';
import { todayBangkok, nextMonthStart } from '../src/lib/dateTh.ts';
import { isFullyPaid } from '../src/lib/jobPayment.ts';
import { fetchAllRows } from '../src/lib/fetchAll.ts';

test('todayBangkok: 00:30 เวลาไทย = วันใหม่แล้ว (UTC ยังเป็นเมื่อวาน)', () => {
  const at = new Date('2026-09-30T17:30:00Z'); // = 2026-10-01 00:30 ไทย
  assert.equal(at.toISOString().slice(0, 10), '2026-09-30');
  assert.equal(todayBangkok(0, at), '2026-10-01');
  assert.equal(todayBangkok(-30, at), '2026-09-01');
  assert.equal(todayBangkok(0, new Date('2026-10-05T16:59:59Z')), '2026-10-05');
  assert.equal(todayBangkok(0, new Date('2026-10-05T17:00:00Z')), '2026-10-06');
});

test('nextMonthStart: เดือน 30 วัน, ก.พ., ธ.ค.', () => {
  assert.equal(nextMonthStart('2026-09'), '2026-10-01'); // ก.ย. 30 วัน
  assert.equal(nextMonthStart('2026-04'), '2026-05-01'); // เม.ย. 30 วัน
  assert.equal(nextMonthStart('2026-02'), '2026-03-01');
  assert.equal(nextMonthStart('2028-02'), '2028-03-01');
  assert.equal(nextMonthStart('2026-12'), '2027-01-01');
});

// สำเนาตรรกะ isDateInFilter (lib/utils.ts) — เทียบว่าช่วง [YYYY-MM-01, nextMonthStart) ให้ผลเหมือนเดิมทุกวัน
const isDateInFilterOld = (dateStr: string, monthIndex: number, yearAd: number) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getMonth() === monthIndex && d.getFullYear() === yearAd;
};
test('ช่วงวันที่ .gte/.lt ให้ผลเท่ากับ isDateInFilter เดิม ทุกวัน 2024–2028', () => {
  let checked = 0;
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2029, 0, 1); t += 86400000) {
    const ds = new Date(t).toISOString().slice(0, 10);
    for (const ym of ['2024-02', '2026-04', '2026-09', '2026-10', '2026-12', '2027-01', '2028-02']) {
      const [y, m] = ym.split('-').map(Number);
      const inRange = ds >= `${ym}-01` && ds < nextMonthStart(ym);
      assert.equal(inRange, isDateInFilterOld(ds, m - 1, y), `${ds} vs ${ym}`);
      checked++;
    }
  }
  assert.ok(checked > 10000);
});

test('isFullyPaid: รับครบ/เกิน ปิดได้, รับบางส่วนไม่ปิด, ทศนิยมไม่คลาด', () => {
  assert.equal(isFullyPaid(15000, 15000), true);
  assert.equal(isFullyPaid(16000, 15000), true);
  assert.equal(isFullyPaid(10000, 15000), false);       // งานรับบางส่วน
  assert.equal(isFullyPaid(10000 + 4999.99, 15000), false);
  assert.equal(isFullyPaid(0.1 + 0.2, 0.3), true);       // 0.30000000000000004
  assert.equal(isFullyPaid(0, 0), true);
});

test('fetchAllRows: รวมทุกหน้า, หยุดเมื่อหน้าไม่เต็ม, คืน error', async () => {
  const rows = Array.from({ length: 2005 }, (_, i) => i);
  const calls: [number, number][] = [];
  const r = await fetchAllRows<number>(async (a, b) => { calls.push([a, b]); return { data: rows.slice(a, b + 1), error: null }; });
  assert.equal(r.data.length, 2005);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  const exact = await fetchAllRows<number>(async (a, b) => ({ data: rows.slice(0, 1000).slice(a, b + 1), error: null }));
  assert.equal(exact.data.length, 1000);
  const bad = await fetchAllRows<number>(async () => ({ data: null, error: { message: 'boom' } }));
  assert.equal(bad.error?.message, 'boom');
});
