// ทดสอบ lib/tripProfit (กำไรรายเที่ยว/รายวัน) — DESIGN_TRIP_PROFIT_dev1.md
// รัน:  node --import ./scripts/ts-hooks.mjs scripts/test-trip-profit.mts           (unit test ไม่แตะ DB)
//       node --import ./scripts/ts-hooks.mjs scripts/test-trip-profit.mts --live    (+ SELECT ข้อมูลจริง กระทบยอดกับรายงานรายเดือนทุกเดือน)
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
  eq('29 มิ.ย.: Daily = Σเที่ยว (น้ำมัน 15,780 กำไร 5,820)', [r.days[0].fuel_own, r.days[0].profit, r.totals.profit], [15780, 5820, 5820]);
}
// ── 2) ไมล์รวมกลุ่ม: เที่ยวหลักรับน้ำมันทั้งก้อน เที่ยวไมล์ 0 ได้ 0 (11 ก.ย.) ──
{
  const r = R([
    row({ date: '2026-09-11', odometer_start: 324146, odometer_end: 324798, fuel_cost: 11500, transport_price: 9000, trip_pay: 900 }),
    row({ date: '2026-09-11', odometer_start: 324798, odometer_end: 324798, transport_price: 6000, trip_pay: 600 }),
    row({ date: '2026-09-11', odometer_start: 324798, odometer_end: 324798, transport_price: 7500, trip_pay: 750 }),
  ], '2026-09-01', '2026-09-30');
  eq('11 ก.ย.: เที่ยวหลักรับ 11,500 เที่ยวไมล์ 0 ได้ 0', r.trips.map(t => t.fuel), [11500, 0, 0]);
  eq('11 ก.ย.: เที่ยว 2–3 ไม่ทราบระยะ รวมรอบ 1, ต้นทุน/กม. กลุ่ม 21.09', [r.trips.map(t => [t.km, t.group_host]), r.trips[0].group_size, r.trips[0].cost_per_km],
    [[[652, null], [null, 1], [null, 1]], 3, 21.09]);
  eq('11 ก.ย.: ค่าเฉลี่ย/กม. ในการ์ดคิดทั้งกลุ่ม', [r.totals.cost_per_km, r.totals.profit_per_km], [21.09, 13.42]);
}
// ── 3) ข้อมูลจริงจง 30 ส.ค.–1 ก.ย. 2026: ไม่ยกน้ำมันข้ามวัน + ป้ายเตือนแถว '-' (CEO อนุมัติ 2026-10-07) ──
{
  const rows = [
    row({ date: '2026-08-30', origin: 'พิษณุโลก', destination: 'พิจิตร', product: 'แกลบ', odometer_start: 319995, odometer_end: 320866, fuel_cost: 12520, transport_price: 3000, trip_pay: 300 }),
    row({ date: '2026-08-30', origin: 'พิษณุโลก', destination: 'ลำพูน', product: 'ข้าว', odometer_start: 320866, odometer_end: 320866, other_cost: 100, transport_price: 12000, trip_pay: 1200 }),
    row({ date: '2026-08-31', origin: '-', destination: '-', product: '', odometer_start: 320866, odometer_end: 321428, fuel_cost: 8510, other_cost: 100, transport_price: 0, trip_pay: 0 }),
    row({ date: '2026-09-01', origin: 'เชียงใหม่', destination: 'พิจิตร', product: 'ข้าวโพดสด', odometer_start: 321428, odometer_end: 322341, fuel_cost: 12900, transport_price: 18000, trip_pay: 1800 }),
    row({ date: '2026-09-01', origin: 'เชียงใหม่', destination: 'พิษณุโลก', product: 'ข้าวโพดแห้ง', odometer_start: 322341, odometer_end: 322341, transport_price: 1500, trip_pay: 250 }),
    row({ date: '2026-09-01', origin: 'พิจิตร', destination: 'พิษณุโลก', product: 'ข้าวโพดสด', odometer_start: 322341, odometer_end: 322341, transport_price: 1500, trip_pay: 250 }),
  ];
  const sep = R(rows, '2026-09-01', '2026-09-30'), aug = R(rows, '2026-08-01', '2026-08-31');
  const d = (r: typeof sep, date: string) => r.days.find(x => x.date === date)!;
  // 1 ก.ย.: ต้นทุนวัน 12,900 + 2,300 = 15,200 ; กำไร 21,000 − 15,200 = 5,800 ; ต้นทุน/กม. 15,200 ÷ 913 = 16.65
  eq('1 ก.ย.: วัน ต้นทุน 15,200 กำไร 5,800 ต้นทุน/กม. 16.65 กม. 913 เติม 1 ครั้ง',
    [d(sep, '2026-09-01').cost, d(sep, '2026-09-01').profit, d(sep, '2026-09-01').cost_per_km, d(sep, '2026-09-01').km, d(sep, '2026-09-01').fills], [15200, 5800, 16.65, 913, 1]);
  eq('1 ก.ย.: น้ำมัน 12,900/0/0 (ไม่ยก 8,510 จาก 31 ส.ค.)', sep.trips.map(t => t.fuel), [12900, 0, 0]);
  eq('1 ก.ย.: เชียงใหม่→พิษณุโลก กำไร +1,250 ; รอบ 1 +3,300', sep.trips.map(t => [t.destination, t.profit]), [['พิจิตร', 3300], ['พิษณุโลก', 1250], ['พิษณุโลก', 1250]]);
  eq('ก.ย.: ไม่มีน้ำมันวันไม่มีเที่ยว', sep.totals.fuel_no_trip, 0);
  // 30 ส.ค.: แกลบ (871 กม.) รับ 12,520 ทั้งก้อน ลำพูน (ไมล์ 0 รวมกลุ่ม) ได้ 0 ; วัน 15,000 − 12,520 − 1,500 = 980
  eq('30 ส.ค.: แกลบ 12,520 ลำพูน 0 → −9,820 / +10,800', aug.trips.map(t => [t.fuel, t.profit]), [[12520, -9820], [0, 10800]]);
  eq('30 ส.ค.: กำไรทั้งกลุ่ม +980 (2 เที่ยว) ที่แกลบ ; ลำพูนอ้างรอบ 1 ; กำไรรายเที่ยวเดิมไม่เปลี่ยน',
    aug.trips.map(t => [t.group_profit, t.group_size, t.group_host, t.profit]), [[980, 2, null, -9820], [null, 1, 1, 10800]]);
  eq('30 ส.ค.: กำไรทั้งกลุ่ม = กำไรวัน', aug.trips[0].group_profit, d(aug, '2026-08-30').profit);
  eq('1 ก.ย.: กำไรทั้งกลุ่ม 3,300 + 1,250 + 1,250 = 5,800 (3 เที่ยว)', [sep.trips[0].group_profit, sep.trips[0].group_size], [5800, 3]);
  eq('30 ส.ค.: วัน ต้นทุน 14,020 กำไร 980 ต้นทุน/กม. 16.10', [d(aug, '2026-08-30').cost, d(aug, '2026-08-30').profit, d(aug, '2026-08-30').cost_per_km], [14020, 980, 16.1]);
  // 31 ส.ค.: วันไม่มีเที่ยว น้ำมัน 8,510 เป็นต้นทุนของวันนั้นเอง + ป้ายเตือน (ไม่ย้ายตัวเลข)
  eq('31 ส.ค.: วัน ต้นทุน 8,510 กำไร −8,510 กม. 562 ต้นทุน/กม. 15.14',
    [d(aug, '2026-08-31').cost, d(aug, '2026-08-31').profit, d(aug, '2026-08-31').km, d(aug, '2026-08-31').cost_per_km, d(aug, '2026-08-31').fuel_no_trip], [8510, -8510, 562, 15.14, 8510]);
  eq('31 ส.ค.: ป้ายเตือน → เที่ยว พิษณุโลก → ลำพูน 30 ส.ค.', d(aug, '2026-08-31').hints.map(h => [h.amount, h.trip_date, h.route]), [[8510, '2026-08-30', 'พิษณุโลก → ลำพูน']]);
  eq('ส.ค.: น้ำมันวันไม่มีเที่ยว 8,510 ; วันอื่นไม่มีป้าย', [aug.totals.fuel_no_trip, aug.days.filter(x => x.hints.length).length, sep.days.filter(x => x.hints.length).length], [8510, 1, 0]);
  eq('ส.ค.: ค่าใช้จ่ายอื่น 2 รายการ (ลงข้าว + ขึ้น)', aug.other_expenses.map(o => [o.amount, o.route]), [[100, 'พิษณุโลก → ลำพูน'], [100, null]]);
  // ป้ายต้องอยู่ในกรอบ 3 วันก่อนหน้า และไมล์เริ่มต้องตรง
  const far = R([rows[1], { ...rows[2], date: '2026-09-03' }], '2026-09-01', '2026-09-30');
  const off = R([rows[1], { ...rows[2], odometer_start: 320867 }], '2026-08-01', '2026-08-31');
  eq('ป้าย: เกิน 3 วัน / ไมล์ไม่ตรง → ไม่ขึ้น', [far.days[0].hints.length, off.days.find(x => x.date === '2026-08-31')!.hints.length], [0, 0]);
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
  eq('ประมาณการ: 500 กม. × 20 = 10,000 ลงเที่ยวหลักของกลุ่ม', d5.map(t => [t.fuel, t.fuel_mode]), [[10000, 'estimate'], [0, 'estimate']]);
  eq('ประมาณการไม่นับในต้นทุนวัน: วัน 5 มิ.ย. ต้นทุน = ค่าเที่ยว 1,200', r.days.find(d => d.date === '2026-06-05')!.cost, 1200);
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
  eq('เที่ยวเดี่ยว: ไม่มีกำไรทั้งกลุ่ม', r.trips.map(t => t.group_profit), [null, null]);
}
// ── 7) กระทบยอด ──
eq('reconcile: สูตรบรรทัดรวมถูก', reconcileWithMonthlyReport(
  { profit: 100, fuel_estimated: 10, off_trip_revenue: 5, off_trip_pay: 1, fuel_no_trip: 4, other_expenses: 20 } as never,
  { net_profit: 40, total_driver_cost: 80, total_commission: 30, total_extra_expenses: 0 }).diff, 0);

console.log(`\nunit: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);

// ── live: SELECT อย่างเดียว ──
if (process.argv.includes('--live')) {
  const { sqlJson, loadMonth, lastDayOf } = await import('./live-report.mts');
  const { buildMonthlyReport } = await import('../src/lib/monthlyReport.ts');
  const all = sqlJson<TPRow[]>(`
    select coalesce(json_agg(json_build_object(
      'id', t.id, 'date', t.date, 'driver_id', t.driver_id, 'origin', t.origin, 'destination', t.destination, 'product', t.product,
      'plate', t.plate, 'odometer_start', t.odometer_start, 'odometer_end', t.odometer_end,
      'transport_price', t.transport_price, 'trip_pay', t.trip_pay, 'fuel_cost', t.fuel_cost, 'fuel_litres', t.fuel_litres,
      'other_cost', t.other_cost, 'other_item', t.other_item, 'remarks', t.remarks, 'created_at', t.created_at,
      'drivers', json_build_object('id', d.id, 'name', d.name, 'nickname', d.nickname, 'license_plate', d.license_plate,
        'is_active', d.is_active, 'deleted_at', d.deleted_at, 'start_date', d.start_date, 'end_date', d.end_date))
      order by t.date, t.id), '[]'::json) j
    from trips t join drivers d on d.id = t.driver_id where t.deleted_at is null`);
  console.log(`\nlive: ${all.length} แถว`);
  const months = Array.from(new Set(all.map(t => t.date.slice(0, 7)))).sort();
  for (const ym of months) {
    const from = `${ym}-01`, to = lastDayOf(ym);
    const tp = buildTripProfit(all, { from, to });
    const md = loadMonth(ym);
    const rep = buildMonthlyReport({ month_year: ym, dateFrom: from, dateTo: to, todayDate: '2026-10-05', trips: md.trips, fixedExpenses: md.fixed, expenses: md.expenses });
    const commission = rep.driver_summaries.reduce((a, s) => a + s.total_commission, 0);
    const rc = reconcileWithMonthlyReport(tp.totals, { ...rep.totals, total_commission: commission });
    eq(`live ${ym}: กระทบยอด net_profit รายงาน ${rep.totals.net_profit}`, rc.diff, 0);
    eq(`live ${ym}: จำนวนเที่ยว = รายงาน`, tp.totals.trip_count, rep.totals.trip_count);
    eq(`live ${ym}: ค่าใช้จ่ายอื่น = รายงาน`, tp.totals.other_expenses, Math.round(rep.totals.total_other_cost * 100) / 100);
    eq(`live ${ym}: รายได้เที่ยว+นอกเที่ยว = รายงาน`, Math.round((tp.totals.revenue + tp.totals.off_trip_revenue) * 100) / 100, Math.round(rep.totals.total_revenue * 100) / 100);
    // น้ำมัน: จริงที่ลงเที่ยว + วันไม่มีเที่ยว = Σ fuel_cost เดือน (= total_fuel_cost รายงาน) ; ไม่มีการยกข้ามวัน
    eq(`live ${ym}: น้ำมันกระทบยอด = รายงาน ${Math.round(rep.totals.total_fuel_cost * 100) / 100}`,
      Math.round((tp.totals.fuel_actual + tp.totals.fuel_no_trip) * 100) / 100,
      Math.round(rep.totals.total_fuel_cost * 100) / 100);
    // สรุปรายวัน (สูตร CEO): Σ กำไรวัน − ค่าใช้จ่ายอื่น − ค่าใช้จ่ายเพิ่มเติม − เงินเดือนฐาน = กำไรรายงาน
    const c2 = (n: number) => Math.round(n * 100);
    const dayProfit = tp.days.reduce((a, d) => a + c2(d.profit), 0);
    const base = c2(rep.totals.total_driver_cost) - c2(commission);
    eq(`live ${ym}: Σ กำไรวัน กระทบยอดรายงาน`,
      (dayProfit - c2(tp.totals.other_expenses) - c2(rep.totals.total_extra_expenses) - base) / 100, Math.round(rep.totals.net_profit * 100) / 100);
    // ทุกวัน-รถ: ต้นทุนวัน = น้ำมันที่เติม + ค่าเที่ยว ; กำไรวัน = Σกำไรเที่ยว + ประมาณการคืน + นอกเที่ยว − น้ำมันวันไม่มีเที่ยว
    const bad = tp.days.filter(d => {
      const tt = tp.trips.filter(t => t.vehicle === d.vehicle && t.date === d.date);
      const s = (f: (t: typeof tt[number]) => number) => tt.reduce((a, t) => a + c2(f(t)), 0);
      const want = s(t => t.profit) + s(t => (t.fuel_mode === 'estimate' ? t.fuel : 0)) + c2(d.off_trip.revenue) - c2(d.off_trip.pay) - c2(d.fuel_no_trip);
      return c2(d.profit) !== want || c2(d.cost) !== c2(d.fuel_own) + c2(d.pay) || c2(d.revenue) - c2(d.cost) !== c2(d.profit)
        || tt.length !== d.trip_count || (d.trip_count > 0 && d.fuel_no_trip !== 0);
    });
    eq(`live ${ym}: Daily Summary ตรงผลรวมเที่ยวทุกวัน-รถ (${tp.days.length})`, bad.map(d => `${d.date} ${d.vehicle}`), []);
  }
  // ตัวอย่างในเอกสารออกแบบ
  const sep = buildTripProfit(all, { from: '2026-09-01', to: '2026-09-30' });
  const jun = buildTripProfit(all, { from: '2026-06-01', to: '2026-06-30' });
  const apr = buildTripProfit(all, { from: '2026-04-01', to: '2026-04-30' });
  const pick = (r: typeof sep, d: string) => r.trips.filter(t => t.date === d && t.vehicle === '71-1831-71-1832').map(t => t.fuel);
  eq('live ตัวอย่าง 29 มิ.ย.', pick(jun, '2026-06-29'), [7752.43, 8027.57]);
  eq('live ตัวอย่าง 11 ก.ย. (เที่ยวหลักรับทั้งก้อน)', pick(sep, '2026-09-11'), [11500, 0, 0]);
  eq('live ตัวอย่าง 1 ก.ย. (ไม่ยกจาก 31 ส.ค.)', pick(sep, '2026-09-01'), [12900, 0, 0]);
  const s1 = sep.days.find(d => d.date === '2026-09-01' && d.vehicle === '71-1831-71-1832')!;
  eq('live 1 ก.ย. จง: ต้นทุนวัน 15,200 กำไร 5,800 ต้นทุน/กม. 16.65 ; เชียงใหม่→พิษณุโลก +1,250',
    [s1.cost, s1.profit, s1.cost_per_km, sep.trips.find(t => t.date === '2026-09-01' && t.product === 'ข้าวโพดแห้ง')!.profit], [15200, 5800, 16.65, 1250]);
  const aug = buildTripProfit(all, { from: '2026-08-01', to: '2026-08-31' });
  const a30 = aug.trips.filter(t => t.date === '2026-08-30' && t.vehicle === '71-1831-71-1832');
  eq('live 30 ส.ค. จง: กำไรทั้งกลุ่ม +980 (2 เที่ยว) ที่แกลบ ; ข้าวไมล์ 0 อ้างรอบ 1',
    a30.map(t => [t.product, t.profit, t.group_profit, t.group_size, t.group_host]), [['แกลบ', -9820, 980, 2, null], ['ข้าว', 10800, null, 1, 1]]);
  // ทุกกลุ่มทุกเดือน: กำไรทั้งกลุ่ม = Σ กำไรรายเที่ยวของกลุ่ม (ไม่สร้างตัวเลขใหม่)
  for (const ym of months) {
    const r = buildTripProfit(all, { from: `${ym}-01`, to: lastDayOf(ym) });
    const badG = r.trips.filter(h => h.group_size > 1).filter(h => {
      const mem = r.trips.filter(m => m.date === h.date && m.vehicle === h.vehicle && m.group_host === h.round);
      return mem.length + 1 !== h.group_size || Math.round(h.group_profit! * 100) !== [h, ...mem].reduce((a, t) => a + Math.round(t.profit * 100), 0);
    });
    eq(`live ${ym}: กำไรทั้งกลุ่ม = Σ กำไรเที่ยวในกลุ่ม (${r.trips.filter(h => h.group_size > 1).length} กลุ่ม)`, badG.map(h => `${h.date} ${h.vehicle}`), []);
  }
  eq('live ส.ค.: ป้ายเตือน 3 แถว (เอก 28,30 / จง 31)', aug.days.filter(d => d.hints.length).map(d => [d.date, d.hints[0].trip_date, d.hints[0].amount]).sort(),
    [['2026-08-28', '2026-08-27', 11529.9], ['2026-08-30', '2026-08-29', 9130.2], ['2026-08-31', '2026-08-30', 8510]]);
  // 19 เม.ย.: อัตราเดิม 23.13 ยอดประมาณการเดิม 6,915.10 + 6,915.09 = 13,830.19 ลงเที่ยวหลักของกลุ่มทั้งก้อน
  eq('live ตัวอย่าง 19 เม.ย. ประมาณการ', [pick(apr, '2026-04-19'), apr.days.find(d => d.date === '2026-04-19' && d.vehicle === '71-1831-71-1832')!.est_rate], [[13830.19, 0], 23.13]);
  // ก.ย.: กำไรจากเที่ยวเดิม 122,016 (กติกายกมา) + 8,510 (น้ำมัน 31 ส.ค. ไม่ยกเข้า 1 ก.ย. แล้ว) = 130,526 ; ประมาณการไม่เปลี่ยน
  eq('live ก.ย.: กำไรจากเที่ยว 122,016 + 8,510 ค่าใช้จ่ายอื่น 30,615', [sep.totals.profit, sep.totals.other_expenses], [122016 + 8510, 30615]);
  console.log(`\nรวม: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);
}
if (fail) process.exit(1);
