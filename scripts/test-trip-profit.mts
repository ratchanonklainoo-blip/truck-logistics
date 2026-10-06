// ทดสอบ lib/tripProfit (กำไรรายเที่ยว/รายวัน) — DESIGN_TRIP_PROFIT_dev1.md
// รัน:  node --import ./scripts/ts-hooks.mjs scripts/test-trip-profit.mts           (unit test ไม่แตะ DB)
import {
  buildTripProfit, vehicleKey, classifyRow, splitByWeight, profitColor, reconcileWithMonthlyReport,
  type TPRow, type TPDriver,
} from '../src/lib/tripProfit.ts';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const DR: TPDriver = { id: 'd1', name: 'ทดสอบ', nickname: 'ท', license_plate: '71-1831 - 71-1832 เชียงราย', is_active: true, deleted_at: null };
const DR2: TPDriver = { ...DR, id: 'd2', nickname: 'ส', license_plate: '71-1833/71-1834 เชียงราย' };
let seq = 0;
const row = (o: Partial<TPRow> = {}): TPRow => ({
  id: `t${++seq}`, date: '2026-06-10', driver_id: 'd1', origin: 'A', destination: 'B', product: 'หิน', plate: null,
  odometer_start: 1000, odometer_end: 1000, transport_price: 6000, trip_pay: 600, fuel_cost: 0, fuel_litres: 0,
  other_cost: 0, other_item: '', remarks: '', created_at: `2026-06-10T00:00:${String(seq).padStart(2, '0')}Z`, drivers: DR, ...o,
});
const R = (rows: TPRow[], from = '2026-06-01', to = '2026-06-30') => buildTripProfit(rows, { from, to });

// ── พื้นฐาน ──
eq('ทะเบียนคู่ 3 รูปแบบเป็นรถคันเดียว', [vehicleKey('71-1831 - 71-1832 เชียงราย'), vehicleKey('71-1831/71-1832'), vehicleKey('71-1831/1832')],
  ['71-1831-71-1832', '71-1831-71-1832', '71-1831-71-1832']);
eq('ประเภทแถว: เที่ยว/วิ่งเปล่า/ไม่ได้วิ่ง', [
  classifyRow({ origin: 'A', destination: 'B', odometer_start: 1, odometer_end: 1 }),
  classifyRow({ origin: '-', destination: '-', odometer_start: 100, odometer_end: 200 }),
  classifyRow({ origin: '', destination: '-', odometer_start: 100, odometer_end: 100 })], ['trip', 'empty_run', 'not_run']);
eq('splitByWeight ผลรวมตรงทุกสตางค์', (() => { const s = splitByWeight(1000000, [1, 1, 1]); return [s, s.reduce((a, b) => a + b, 0)]; })(), [[333334, 333333, 333333], 1000000]);
eq('สี: ขาดทุน=แดง, กำไร<10%=เหลือง, อื่น=เขียว, รายได้0=แดง', [profitColor(-1, 100), profitColor(5, 100), profitColor(10, 100), profitColor(0, 0)], ['red', 'yellow', 'green', 'red']);

// ── 1) วันมีเที่ยวมีน้ำมัน กระจายตามระยะ (29 มิ.ย. จง) ──
{
  const r = R([
    row({ date: '2026-06-29', odometer_start: 296604, odometer_end: 297083, fuel_cost: 7580, transport_price: 6000, trip_pay: 600 }),
    row({ date: '2026-06-29', origin: 'เชียงราย', destination: 'พิจิตร', odometer_start: 297083, odometer_end: 297579, fuel_cost: 8200, transport_price: 18000, trip_pay: 1800 }),
  ]);
  eq('29 มิ.ย.: น้ำมันจัดสรร 7,752.43 / 8,027.57', r.trips.map(t => t.fuel), [7752.43, 8027.57]);
  eq('29 มิ.ย.: กำไร −2,352.43 / 8,172.43 สี แดง/เขียว', r.trips.map(t => [t.profit, t.color]), [[-2352.43, 'red'], [8172.43, 'green']]);
  eq('29 มิ.ย.: ต้นทุน/กม. 17.44 / 19.81 ราคาขั้นต่ำ 9,187.67', [r.trips[0].cost_per_km, r.trips[1].cost_per_km, r.trips[0].min_price], [17.44, 19.81, 9187.67]);
  eq('29 มิ.ย.: Daily = Σเที่ยว (น้ำมัน 15,780 กำไร 5,820)', [r.days[0].fuel_pool, r.days[0].profit, r.totals.profit], [15780, 5820, 5820]);
}
// ── 2) ไมล์รวมกลุ่ม แบ่งเท่า (11 ก.ย.) ──
{
  const r = R([
    row({ date: '2026-09-11', odometer_start: 324146, odometer_end: 324798, fuel_cost: 11500, transport_price: 9000, trip_pay: 900 }),
    row({ date: '2026-09-11', odometer_start: 324798, odometer_end: 324798, transport_price: 6000, trip_pay: 600 }),
    row({ date: '2026-09-11', odometer_start: 324798, odometer_end: 324798, transport_price: 7500, trip_pay: 750 }),
  ], '2026-09-01', '2026-09-30');
  eq('11 ก.ย.: แบ่งในกลุ่มเท่ากัน 3,833.34/3,833.33/3,833.33', r.trips.map(t => t.fuel), [3833.34, 3833.33, 3833.33]);
  eq('11 ก.ย.: เที่ยว 2–3 ไม่ทราบระยะ รวมรอบ 1, ต้นทุน/กม. กลุ่ม 21.09', [r.trips.map(t => [t.km, t.group_host]), r.trips[0].group_size, r.trips[0].cost_per_km],
    [[[652, null], [null, 1], [null, 1]], 3, 21.09]);
  eq('11 ก.ย.: ค่าเฉลี่ย/กม. ในการ์ดคิดทั้งกลุ่ม', [r.totals.cost_per_km, r.totals.profit_per_km], [21.09, 13.42]);
}
// ── 3) วันมีน้ำมันไม่มีเที่ยว → ยกไปเที่ยวถัดไป (ข้ามเดือน) ──
{
  const rows = [
    row({ date: '2026-08-31', origin: '-', destination: '-', product: '', odometer_start: 320866, odometer_end: 321428, fuel_cost: 8510, other_cost: 100, transport_price: 0, trip_pay: 0 }),
    row({ date: '2026-09-01', odometer_start: 321428, odometer_end: 322341, fuel_cost: 12900, transport_price: 18000, trip_pay: 1800 }),
    row({ date: '2026-09-01', odometer_start: 322341, odometer_end: 322341, transport_price: 1500, trip_pay: 250 }),
    row({ date: '2026-09-01', odometer_start: 322341, odometer_end: 322341, transport_price: 1500, trip_pay: 250 }),
  ];
  const sep = R(rows, '2026-09-01', '2026-09-30'), aug = R(rows.slice(0, 1), '2026-08-01', '2026-08-31');
  eq('1 ก.ย.: กอง 21,410 = 12,900 + ยกมา 8,510 (จาก 31 ส.ค.)', [sep.days[0].fuel_pool, sep.days[0].carried_in], [21410, [{ from: '2026-08-31', amount: 8510 }]]);
  eq('1 ก.ย.: แบ่งเท่า 7,136.67/7,136.67/7,136.66 กำไรวัน −2,710', [sep.trips.map(t => t.fuel), sep.days[0].profit], [[7136.67, 7136.67, 7136.66], -2710]);
  eq('ก.ย.: ยกมาจากก่อนเดือน 8,510', sep.totals.carried_in_before, 8510);
  eq('ส.ค.: ยังไม่มีเที่ยวถัดไป → ค้าง 8,510 + วันไม่มีเที่ยวยกไป', [aug.totals.pending_out, aug.days[0].carried_out, aug.trips.length], [8510, 8510, 0]);
  eq('ส.ค.: ค่าใช้จ่ายอื่นแถววิ่งเปล่าอยู่ในส่วนเดือน', aug.other_expenses.map(o => [o.amount, o.route]), [[100, null]]);
}
// ── 4) วันมีเที่ยวไม่มีน้ำมัน → ประมาณการ 30 วัน ; ไม่ทราบระยะ → ไม่มีข้อมูล ──
{
  const r = R([
    row({ date: '2026-06-01', odometer_start: 10000, odometer_end: 11000, fuel_cost: 20000 }),          // 20 บาท/กม.
    row({ date: '2026-06-05', odometer_start: 11000, odometer_end: 11500, fuel_cost: 0 }),              // ประมาณ 500×20
    row({ date: '2026-06-05', odometer_start: 11500, odometer_end: 11500, fuel_cost: 0 }),              // กลุ่มเดียวกัน → แบ่งเท่า
    row({ date: '2026-06-07', odometer_start: 11500, odometer_end: 11500, fuel_cost: 0 }),              // ไม่ทราบระยะ ไม่มีน้ำมัน
  ]);
  const d5 = r.trips.filter(t => t.date === '2026-06-05');
  eq('ประมาณการ: 500 กม. × 20 = 10,000 แบ่งเท่าในกลุ่ม', d5.map(t => [t.fuel, t.fuel_mode]), [[5000, 'estimate'], [5000, 'estimate']]);
  eq('ประมาณการ: อัตรา 20 บาท/กม. แยกยอดจากน้ำมันจริง', [r.days.find(d => d.date === '2026-06-05')!.est_rate, r.totals.fuel_actual, r.totals.fuel_estimated], [20, 20000, 10000]);
  eq('ไม่ทราบระยะ+ไม่มีน้ำมัน → no_data น้ำมัน 0', r.trips.filter(t => t.date === '2026-06-07').map(t => [t.fuel, t.fuel_mode, t.cost_per_km]), [[0, 'no_data', null]]);
  eq('การ์ด: นับ no_data 1, ต้นทุน/กม. ไม่รวมประมาณการ', [r.totals.no_data_trips, r.totals.cost_per_km], [1, 20.6]);
}
// ── 5) ไม่ทราบระยะทั้งวัน แต่มีน้ำมัน → หารเท่า ; แถวไม่ใช่เที่ยว ; คนขับถูกลบ ; รถ 2 คันวันเดียวกัน ──
{
  const r = R([
    row({ date: '2026-06-12', odometer_start: 5000, odometer_end: 5000, fuel_cost: 9000 }),
    row({ date: '2026-06-12', odometer_start: 5000, odometer_end: 5000, fuel_cost: 0 }),
    row({ date: '2026-06-12', origin: '-', destination: '-', product: '', odometer_start: 5000, odometer_end: 5000, fuel_cost: 1000, other_cost: 2500, other_item: 'ค่ายาง', transport_price: 0, trip_pay: 0 }),
    row({ date: '2026-06-12', driver_id: 'd2', drivers: DR2, odometer_start: 100, odometer_end: 300, fuel_cost: 4000 }),
    row({ date: '2026-06-12', driver_id: 'dx', drivers: { ...DR, id: 'dx', deleted_at: '2026-06-01' }, odometer_start: 1, odometer_end: 9, fuel_cost: 999 }),
  ]);
  const a = r.trips.filter(t => t.vehicle === '71-1831-71-1832');
  eq('ไม่ทราบระยะทั้งวัน: น้ำมัน 10,000 (รวมแถวซ่อม) หารเท่า', a.map(t => t.fuel), [5000, 5000]);
  eq('แถวซ่อม: ไม่นับเที่ยว ค่าใช้จ่ายอื่นแยก 2,500 + รายการ ค่ายาง', [r.days.find(d => d.vehicle === '71-1831-71-1832')!.off_trip.rows, r.other_expenses.map(o => [o.item, o.amount])], [1, [['ค่ายาง', 2500]]]);
  eq('รถคันที่ 2 แยกคำนวณ, คนขับถูกลบไม่นับ', [r.trips.length, r.trips.filter(t => t.vehicle === '71-1833-71-1834').map(t => t.fuel)], [3, [4000]]);
  eq('ต้นทุนไม่รวมค่าใช้จ่ายอื่น: กำไรหลังหักอื่น = กำไร − 2,500', r.totals.profit_after_other, Math.round((r.totals.profit - 2500) * 100) / 100);
}
// ── 6) รอบที่เรียงตามไมล์ต้น แล้วเวลาบันทึก ──
{
  const r = R([
    row({ date: '2026-06-20', odometer_start: 2000, odometer_end: 2300, created_at: '2026-06-20T10:00:00Z', product: 'สอง' }),
    row({ date: '2026-06-20', odometer_start: 1500, odometer_end: 2000, created_at: '2026-06-20T11:00:00Z', product: 'หนึ่ง' }),
  ]);
  eq('รอบที่ตามไมล์ต้น', r.trips.map(t => [t.round, t.product]), [[1, 'หนึ่ง'], [2, 'สอง']]);
}
// ── 7) กระทบยอด ──
eq('reconcile: สูตรบรรทัดรวมถูก', reconcileWithMonthlyReport(
  { profit: 100, fuel_estimated: 10, off_trip_revenue: 5, off_trip_pay: 1, carried_in_before: 3, pending_out: 2, other_expenses: 20 } as never,
  { net_profit: 45, total_driver_cost: 80, total_commission: 30, total_extra_expenses: 0 }).diff, 0);

console.log(`\nunit: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);

if (fail) process.exit(1);
