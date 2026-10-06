// ทดสอบสูตรกลาง (payrollCalc + monthlyReport) ตามชุดทดสอบ 23 ข้อของ Fern (formula-audit-2026-10-05.md)
// รัน:  node --import ./scripts/ts-hooks.mjs scripts/test-formula.mts            (เฉพาะ unit test ไม่แตะ DB)
//       node --import ./scripts/ts-hooks.mjs scripts/test-formula.mts --live     (+ ดึงข้อมูลจริงแบบ SELECT เทียบกับสูตรเก่า + ตัวเลขที่คาดหวัง)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isRealTrip, countRealTrips } from '../src/lib/tripCount.ts';
import {
  tripPayOf, calcPayroll, baseForMonth, isEmployedInMonth, monthBounds, payrollChangedFields, probationBaseStart,
  payrollMoneyChangedFields, describeMoneyChanges,
} from '../src/lib/payrollCalc.ts';
import { buildMonthlyReport } from '../src/lib/monthlyReport.ts';
import { calculateTotals } from '../src/lib/utils.ts';
import { findDuplicateTrips, odometerWarnings, payMismatch } from '../src/lib/tripChecks.ts';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const DR = { id: 'd1', name: 'ทดสอบ', nickname: 'ท', license_plate: '70-0001 เชียงราย', base_salary: 5000, social_security: 435,
  is_active: true, deleted_at: null, start_date: null as string | null, end_date: null as string | null };
const trip = (o: Partial<Record<string, unknown>> = {}) => ({
  driver_id: 'd1', date: '2026-06-10', origin: 'A', destination: 'B', transport_price: 7000, trip_pay: 700,
  fuel_cost: 0, fuel_litres: 0, distance: 0, other_cost: 0, withdraw: 0, plate: null, drivers: DR, ...o,
}) as never;
const report = (ym: string, trips: never[], fixed: never[] = []) => buildMonthlyReport({
  month_year: ym, ...(() => { const b = monthBounds(ym); return { dateFrom: b.from, dateTo: b.to }; })(),
  todayDate: '2026-10-05', trips, fixedExpenses: fixed, expenses: [],
});

// 1–3 นับเที่ยว
eq('#1 เที่ยว -→- ไม่นับ แต่น้ำมันนับ', (() => { const r = report('2026-06', [trip({ origin: '-', destination: '-', fuel_cost: 6000, transport_price: 0, trip_pay: 0 })]); return [r.totals.trip_count, r.totals.total_fuel_cost]; })(), [0, 6000]);
eq('#2 ต้นทาง - ปลายทาง ลำพูน นับ 1', isRealTrip({ origin: '-', destination: 'ลำพูน' }), true);
eq('#3 " - " ทั้งคู่ไม่นับ', countRealTrips([{ origin: ' - ', destination: ' - ' }]), 0);

// 4 อนุมัติ: ใบเก่าเบิก 0 → เพิ่ม withdraw 1,000 → คำนวณใหม่ต้องเห็นว่าเปลี่ยน
{
  const stored = calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip()] });
  const fresh = calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ withdraw: 1000 })] });
  eq('#4 เบิกเพิ่มหลังคำนวณ → ตรวจพบเปลี่ยน (เบิก/สุทธิ)', payrollChangedFields(stored, fresh), ['total_advance', 'net_pay']);
  eq('#4 ยอดใหม่ เบิก = 1,000', fresh.total_advance, 1000);
  eq('#4 ไม่เปลี่ยน → ไม่มีฟิลด์ต่าง', payrollChangedFields(fresh, calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ withdraw: 1000 })] })), []);
  // เดือนที่ล็อก: เทียบเฉพาะฟิลด์เงิน — ต่างแค่จำนวนเที่ยว/ระยะทาง (เช่น ใบ จง พ.ค./มิ.ย.) ไม่บล็อกอนุมัติ
  const tripsOnly = calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip(), trip({ origin: '-', destination: '-', trip_pay: 0, distance: 50 })] });
  const storedMoreTrips = { ...tripsOnly, trip_count: tripsOnly.trip_count + 1, total_distance: 0 };
  eq('#4L ต่างแค่จำนวนเที่ยว/ระยะทาง → ฟิลด์เงินไม่ต่าง', [payrollChangedFields(storedMoreTrips, tripsOnly), payrollMoneyChangedFields(storedMoreTrips, tripsOnly)],
    [['trip_count', 'total_distance'], []]);
  eq('#4L เบิกต่าง → ฟิลด์เงินที่ต่าง = เบิก/สุทธิ (ไม่มีจำนวนเที่ยว)', payrollMoneyChangedFields({ ...stored, trip_count: 9 }, fresh), ['total_advance', 'net_pay']);
  eq('#4L ข้อความเตือนแสดงเฉพาะฟิลด์เงินที่ต่าง', describeMoneyChanges({ ...stored, trip_count: 9 }, fresh),
    `เบิก ${(0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} → ${(1000).toLocaleString('th-TH', { minimumFractionDigits: 2 })}, สุทธิ ${stored.net_pay.toLocaleString('th-TH', { minimumFractionDigits: 2 })} → ${fresh.net_pay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`);
}
// 5 คงรายได้/หักอื่น
{
  const p = calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip()], other_additions: 500, other_deductions: 200 });
  eq('#5 other_additions 500 คงอยู่ net +500 −200', [p.other_additions, p.other_deductions, p.gross_pay, p.net_pay], [500, 200, 6200, 5565]);
}
// 6 แหล่งเบิกเดียว = trips.withdraw (ใบเบิก advance_requests ไม่ถูกนำมาหัก — ไม่มี input ให้ส่งเข้าสูตร)
eq('#6 เบิก = Σ trips.withdraw', calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ withdraw: 3600 })] }).total_advance, 3600);
// 7 ขอบเดือน
eq('#7 ขอบเดือน', ['2026-01', '2026-02', '2028-02', '2026-04', '2026-12'].map(m => monthBounds(m).to),
  ['2026-01-31', '2026-02-28', '2028-02-29', '2026-04-30', '2026-12-31']);
// 12–13 ปิดใช้งาน/ลบ
{
  const ended = { ...DR, is_active: false, end_date: '2026-06-15' };
  eq('#12 end_date 15 มิ.ย. → มิ.ย. ทำงาน ก.ค. ไม่ทำงาน', [isEmployedInMonth(ended, '2026-06'), isEmployedInMonth(ended, '2026-07')], [true, false]);
  eq('#13 ปิดใช้งานแล้ว รายรับ มิ.ย. ยังนับ', report('2026-06', [trip({ drivers: ended })]).totals.total_revenue, 7000);
  eq('#13 ปิดใช้งาน เดือนหลัง end_date ฐาน = 0', baseForMonth(ended, '2026-07'), { base_salary: 0, social_security: 0 });
  eq('#13b คนขับถูกลบแบบเดิม (deleted_at) ยังไม่นับ — คงตัวเลข มี.ค.–พ.ค.',
    report('2026-05', [trip({ drivers: { ...DR, is_active: false, deleted_at: '2026-06-06' } })]).totals.total_revenue, 0);
  const legacyOff = { ...DR, is_active: false, end_date: null };
  eq('#13c ปิดใช้งานแบบเก่า (ไม่มี end_date) ไม่นับเหมือนเดิม + ไม่สร้างใบเงินเดือน',
    [report('2026-05', [trip({ drivers: legacyOff })]).totals.total_revenue, isEmployedInMonth(legacyOff, '2026-05')], [0, false]);
  eq('#13d ปิดใช้งานแบบใหม่ ก่อนวันเริ่ม/หลังวันสุดท้าย ไม่สร้างใบเงินเดือน',
    [isEmployedInMonth({ ...ended, start_date: '2026-03-01' }, '2026-02'), isEmployedInMonth(ended, '2026-07')], [false, false]);
}
// 14–16 ค่าเที่ยว
eq('#14 ค่าขนส่ง 7,000 ค่าเที่ยว 1,000 → 1,000 ทุกจุด', [
  report('2026-06', [trip({ trip_pay: 1000 })]).totals.total_driver_cost - 5000,
  calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ trip_pay: 1000 })] }).total_commission,
  calculateTotals([trip({ trip_pay: 1000 })]).trip_pay,
], [1000, 1000, 1000]);
eq('#15 trip_pay 0 → ค่าเที่ยว 0 แต่นับเที่ยว', (() => { const p = calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ trip_pay: 0 })] }); return [p.total_commission, p.trip_count]; })(), [0, 1]);
eq('#16 trip_pay null → ทุกจุดได้ 0 เท่ากัน (ไม่ใช้ 10%)', [
  tripPayOf({ trip_pay: null }),
  report('2026-06', [trip({ trip_pay: null })]).totals.total_driver_cost - 5000,
  calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ trip_pay: null })] }).total_commission,
  calculateTotals([trip({ trip_pay: null })]).trip_pay,
], [0, 0, 0, 0]);
// 18 เริ่มกลางเดือน
{
  const mid = { ...DR, base_salary: 6000, start_date: '2026-06-15' };
  eq('#18 เริ่ม 15 มิ.ย. → มิ.ย. ฐาน 0 ไม่หักประกันสังคม', baseForMonth(mid, '2026-06'), { base_salary: 0, social_security: 0 });
  eq('#18 เดือนถัดไปฐานเต็ม', baseForMonth(mid, '2026-07'), { base_salary: 6000, social_security: 435 });
  eq('#18 เริ่มวันที่ 1 → ฐานเต็ม', baseForMonth({ ...mid, start_date: '2026-06-01' }, '2026-06'), { base_salary: 6000, social_security: 435 });
  eq('#18 ไม่มี start_date → ฐานเต็ม', baseForMonth({ ...mid, start_date: null }, '2026-06').base_salary, 6000);
  eq('#18 ก่อนเริ่มงาน → ไม่ทำงาน', isEmployedInMonth(mid, '2026-05'), false);
  eq('#18 รายงาน มิ.ย. ไม่หักฐาน', report('2026-06', [trip({ drivers: mid })]).totals.total_driver_cost, 700);
}
// 023 base_salary_start (ทดลองงาน)
{
  const ek = { ...DR, base_salary: 5000, social_security: 435, start_date: '2026-05-26', base_salary_start: '2026-09-01' };
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  eq('#P1 ทดลองงาน 3 เดือน: เริ่ม 26 พ.ค. ฐานเริ่ม ก.ย. → เม.ย.–ส.ค. 0, ก.ย.–ต.ค. เต็ม',
    months.map(m => baseForMonth(ek, m).base_salary), [0, 0, 0, 0, 0, 5000, 5000]);
  eq('#P1 ช่วงทดลองงานไม่หักประกันสังคม / ก.ย. หักเต็ม', [baseForMonth(ek, '2026-07').social_security, baseForMonth(ek, '2026-09').social_security], [0, 435]);
  eq('#P1 ใบ ก.ค. ช่วงทดลองงาน = ค่าเที่ยวอย่างเดียว', calcPayroll({ driver: ek, month_year: '2026-07', trips: [trip({ date: '2026-07-10' })] }).net_pay, 700);
  eq('#P1 รายงาน ก.ค. ไม่หักฐาน / ก.ย. หักฐาน', [
    report('2026-07', [trip({ date: '2026-07-10', drivers: ek })]).totals.total_driver_cost,
    report('2026-09', [trip({ date: '2026-09-10', drivers: ek })]).totals.total_driver_cost,
  ], [700, 5700]);
  eq('#P2 probationBaseStart: 26 พ.ค. → ก.ย. / 1 มิ.ย. → ก.ย. / 15 พ.ย. 2026 → มี.ค. 2027 (ข้ามปี) / 1 ต.ค. → ม.ค. 2027 / 2 ธ.ค. → เม.ย. 2027',
    [probationBaseStart('2026-05-26'), probationBaseStart('2026-06-01'), probationBaseStart('2026-11-15'), probationBaseStart('2026-10-01'), probationBaseStart('2026-12-02')],
    ['2026-09-01', '2026-09-01', '2027-03-01', '2027-01-01', '2027-04-01']);
  const y = { ...DR, start_date: '2026-11-15', base_salary_start: '2027-03-01' };
  eq('#P2 ข้ามปี: ธ.ค. 2026–ก.พ. 2027 ฐาน 0, มี.ค. 2027 เต็ม',
    ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map(m => baseForMonth(y, m).base_salary), [0, 0, 0, 0, 5000]);
  // ค่าว่าง / คนขับเดิมไม่มีค่า → ผลเท่ากติกาเดิมทุกกรณี
  const legacy = (d: typeof DR & { start_date: string | null }) => months.map(m => baseForMonth(d, m));
  for (const [label, d] of [['ไม่มีทั้งคู่', DR], ['เริ่มกลางเดือน', { ...DR, start_date: '2026-06-15' }], ['เริ่มวันที่ 1', { ...DR, start_date: '2026-06-01' }],
    ['ปิดใช้งาน', { ...DR, is_active: false, end_date: '2026-08-10' }]] as const) {
    eq(`#P3 ค่าว่าง (${label}): null / undefined / '' ให้ผลเท่ากติกาเดิม`, [
      months.map(m => baseForMonth({ ...d, base_salary_start: null }, m)),
      months.map(m => baseForMonth({ ...d, base_salary_start: '' }, m)),
    ], [legacy(d as never), legacy(d as never)]);
  }
  eq('#P3 ฐานเริ่มเดือนเดียวกับเริ่มงานกลางเดือน → ใช้ base_salary_start (เดือนนั้นฐานเต็ม)',
    baseForMonth({ ...DR, start_date: '2026-06-15', base_salary_start: '2026-06-01' }, '2026-06').base_salary, 5000);
  eq('#P3 ก่อนเริ่มงาน/หลังวันสุดท้าย ยังเป็น 0 แม้ถึงเดือนฐาน',
    [baseForMonth({ ...DR, start_date: '2026-06-15', base_salary_start: '2026-01-01' }, '2026-05').base_salary,
     baseForMonth({ ...DR, is_active: false, end_date: '2026-08-10', base_salary_start: '2026-01-01' }, '2026-09').base_salary], [0, 0]);
}
// 21 จ่ายสด: withdraw = trip_pay → สุทธิไม่รวม 700 นี้
eq('#21 จ่ายสด 700 → สุทธิ = ฐาน − ประกันสังคม', calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ withdraw: 700 })] }).net_pay, 5000 - 435);
eq('#21 รายงานกำไรไม่หักเงินเบิก', report('2026-06', [trip({ withdraw: 700 })]).totals.net_profit, report('2026-06', [trip()]).totals.net_profit);
// 22 ทศนิยม: เก็บ 2 ตำแหน่ง ไม่ปัดลงหลักสิบ (สูตรเดิม)
eq('#22 net 4,656.50 เก็บตามจริง', calcPayroll({ driver: { ...DR, base_salary: 0, social_security: 0 }, month_year: '2026-06', trips: [trip({ trip_pay: 4656.5 })] }).net_pay, 4656.5);
// ทะเบียน: trips.plate ถ้ามี ไม่มีใช้ทะเบียนคนขับ
eq('ทะเบียนรายงาน: ไม่มี plate → ทะเบียนคนขับ', report('2026-06', [trip()]).driver_summaries[0].truck_license_plate, DR.license_plate);
eq('ทะเบียนรายงาน: plate ส่วนใหญ่ของเดือน', report('2026-06', [trip({ plate: '71-1833' }), trip({ plate: '71-1833' }), trip()]).driver_summaries[0].truck_license_plate, '71-1833');

// 20 เตือนเที่ยวซ้ำ / ไมล์ / ค่าไม่สอดคล้อง (lib/tripChecks ที่ TripForm ใช้)
{
  const P = '71-1833/71-1834 เชียงราย';
  const base = { id: 'n', date: '2026-05-10', driver_id: 'd1', origin: 'เชียงราย', destination: 'ลำพูน', driver_plate: P };
  const old = [
    { id: 'a', date: '2026-05-11', driver_id: 'd1', origin: ' เชียงราย', destination: 'ลำพูน', driver_plate: P },           // +1 วัน ซ้ำ
    { id: 'b', date: '2026-05-12', driver_id: 'd1', origin: 'เชียงราย', destination: 'ลำพูน', driver_plate: P },            // +2 วัน ไม่ซ้ำ
    { id: 'c', date: '2026-05-10', driver_id: 'd2', origin: 'เชียงราย', destination: 'ลำพูน', plate: '71-1833/71-1834' },   // คนขับอื่น แต่ทะเบียนเดียวกัน → ซ้ำ
    { id: 'd', date: '2026-05-10', driver_id: 'd2', origin: 'เชียงราย', destination: 'ลำพูน', driver_plate: '70-0001' },     // รถคนละคัน
    { id: 'e', date: '2026-05-10', driver_id: 'd1', origin: 'เชียงราย', destination: 'พะเยา', driver_plate: P },            // เส้นทางอื่น
  ];
  eq('#20 เที่ยวซ้ำ ±1 วัน รถ/ทะเบียนเดียวกัน เส้นทางเดียวกัน', findDuplicateTrips(base, old).map(t => t.id), ['a', 'c']);
  eq('#20 แก้แถวเดิมไม่เตือนตัวเอง (b อยู่ +1 วันจาก 11 พ.ค. จึงซ้ำจริง)', findDuplicateTrips({ ...base, id: 'a', date: '2026-05-11' }, old).map(t => t.id), ['b', 'c']);
  eq('#20 แถว -→- ไม่เช็คซ้ำ', findDuplicateTrips({ ...base, origin: '-', destination: '' }, old as never).length, 0);
  const odo = [{ id: 'x', date: '2026-05-09', driver_id: 'd1', driver_plate: P, origin: 'A', destination: 'B', odometer_start: 1000, odometer_end: 1500 }];
  eq('#20 ไมล์ถอยหลัง', odometerWarnings({ ...base, odometer_start: 1400, odometer_end: 1800 }, odo).length, 1);
  eq('#20 ไมล์ซ้ำ', odometerWarnings({ ...base, odometer_start: 1500, odometer_end: 1500 }, odo).length, 1);
  eq('#20 ไมล์ต่อเนื่องปกติ ไม่เตือน', odometerWarnings({ ...base, odometer_start: 1501, odometer_end: 1800 }, odo), []);
  eq('#20 รถคันอื่นไม่เตือน', odometerWarnings({ ...base, driver_plate: '70-0001', odometer_start: 1400 }, odo), []);
  eq('#20 ค่าขนส่ง 0 ค่าเที่ยว > 0 / กลับกัน / ปกติ / แถว -→-', [
    payMismatch({ ...base, transport_price: 0, trip_pay: 700 }), payMismatch({ ...base, transport_price: 7000, trip_pay: 0 }),
    payMismatch({ ...base, transport_price: 7000, trip_pay: 700 }), payMismatch({ ...base, origin: '-', destination: '-', trip_pay: 700 }),
  ], ['no_price', 'no_pay', null, null]);
}

console.log('ไม่ทดสอบในสคริปต์นี้ (เป็นหน้าจอ/คิวรี): #8 วันที่เริ่มต้นฟอร์ม, #9–#11 ค่าประจำ (scripts/test-fixed-expenses.mts), #17 snapshot ฐานในใบเงินเดือน, #19 คนขับไม่มีเที่ยว, #20/#21 ส่วนหน้าจอ (กล่องเตือน/ช่องติ๊ก), #23 เกิน 1,000 แถว (scripts/verify-m4-live.mts)');
console.log(`\nunit: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);

// ── เทียบกับข้อมูลจริง (SELECT อย่างเดียว) ──
if (process.argv.includes('--live')) {
  const { loadMonth, lastDayOf } = await import('./live-report.mts');
  const { oldMonthlyReport } = await import('./formula-old.mts');
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  // ตัวเลขที่ถูกต้องหลังตั้งค่าเอก (start_date 2026-05-26, base_salary_start 2026-09-01 → ไม่มีฐาน/ปกส พ.ค.–ส.ค.)
  // Director อนุมัติ 2026-10-06: พ.ค.–ส.ค. กำไรเพิ่ม 5,000/เดือนจากสูตรเก่า (ฐานเต็ม) ที่เหลือเท่าเดิม
  const EXPECT: Record<string, { dashboard: number; report: number }> = {
    '2026-03': { dashboard: 91050, report: -113366 },
    '2026-04': { dashboard: 37546.4, report: -166869.6 },
    '2026-05': { dashboard: 54622.9, report: -149793.1 },
    '2026-06': { dashboard: 83206.2, report: -121209.8 },
    '2026-07': { dashboard: 62363, report: -142053 },
    '2026-08': { dashboard: 70867, report: -133549 },
    '2026-09': { dashboard: 89911, report: -74855 },
    '2026-10': { dashboard: -5700, report: -170466 },
  };
  const cacheFile = path.join(tmpdir(), 'truck-formula-live-cache.json');
  const cache: Record<string, ReturnType<typeof loadMonth>> = process.argv.includes('--refresh') || !existsSync(cacheFile)
    ? {} : JSON.parse(readFileSync(cacheFile, 'utf8'));
  for (const ym of months) {
    const d = cache[ym] ??= loadMonth(ym);
    const rep = buildMonthlyReport({ month_year: ym, dateFrom: `${ym}-01`, dateTo: lastDayOf(ym), todayDate: '2026-10-05',
      trips: d.trips, fixedExpenses: d.fixed, expenses: d.expenses });
    const old = oldMonthlyReport({ drivers: d.drivers, trips: d.trips, expenses: d.expenses, fixed_expenses: d.fixed }, ym);
    const t = rep.totals;
    // สูตรเก่าคิดฐานเต็มทุกคนขับที่มีเที่ยว — ส่วนต่างที่ยอมให้ต่าง = ฐานที่ baseForMonth ตัดออก (ทดลองงาน/เริ่มกลางเดือน) เท่านั้น
    const withTrips = new Set((d.trips as { driver_id: string }[]).map(x => x.driver_id));
    const baseRemoved = (d.drivers as Record<string, unknown>[])
      .filter(x => withTrips.has(String(x.id)) && !x.deleted_at && x.is_active !== false)
      .reduce((s, x) => s + (Number(x.base_salary) || 0) - baseForMonth(x as never, ym).base_salary, 0);
    const same = Math.abs(t.net_profit - (old.net_profit + baseRemoved)) < 0.005
      && Math.abs(t.net_after_fixed - (old.net_after_fixed + baseRemoved)) < 0.005
      && t.trip_count === old.trips && Math.abs(t.total_revenue - old.rev) < 0.005;
    if (same) pass++; else fail++;
    console.log(`${same ? 'PASS' : 'FAIL'}  live ${ym}: กำไร dashboard เก่า ${old.net_profit} ใหม่ ${t.net_profit} | รายงาน เก่า ${old.net_after_fixed} ใหม่ ${t.net_after_fixed} | ฐานที่ตัดออก ${baseRemoved} | เที่ยว ${old.trips}/${t.trip_count}`);
    eq(`live ${ym}: ตัวเลขที่คาดหวัง (dashboard/รายงาน)`, { dashboard: t.net_profit, report: t.net_after_fixed }, EXPECT[ym]);
    eq(`live ${ym}: ฐานที่ตัดออกจากสูตรเก่า (เฉพาะเอก พ.ค.–ส.ค.)`, baseRemoved, ym >= '2026-05' && ym <= '2026-08' ? 5000 : 0);
  }
  writeFileSync(cacheFile, JSON.stringify(cache));

  // จำลองใบเงินเดือน (ไม่เขียน DB): คำนวณทุกใบที่มีอยู่ด้วยสูตรใหม่ เทียบตัวเลขที่เก็บไว้ + ใบไหนหน้าเงินเดือนจะแสดง/auto-sync
  const { sqlJson } = await import('./live-report.mts');
  const sim = sqlJson<{ payrolls: Record<string, unknown>[]; drivers: Record<string, unknown>[]; trips: Record<string, unknown>[] }>(`
    select json_build_object(
      'payrolls', (select json_agg(p order by month_year) from payrolls p where deleted_at is null),
      'drivers', (select json_agg(d) from drivers d),
      'trips', (select json_agg(json_build_object('driver_id', driver_id, 'date', date, 'origin', origin, 'destination', destination,
                 'trip_pay', trip_pay, 'withdraw', withdraw, 'distance', distance)) from trips where deleted_at is null)
    )::text j`);
  const { isCountedDriver } = await import('../src/lib/payrollCalc.ts');
  for (const p of sim.payrolls) {
    const d = sim.drivers.find(x => x.id === p.driver_id)!;
    const ym = String(p.month_year); const b = monthBounds(ym);
    const trips = sim.trips.filter(t => t.driver_id === p.driver_id && String(t.date) >= b.from && String(t.date) <= b.to);
    const fresh = calcPayroll({ driver: d as never, month_year: ym, trips: trips as never, other_additions: p.other_additions as number, other_deductions: p.other_deductions as number });
    const shown = isCountedDriver(d as never); const sync = shown && isEmployedInMonth(d as never, ym) && p.status === 'draft';
    const diff = payrollChangedFields(p as never, fresh).map(k => `${k} ${p[k]}→${fresh[k]}`).join(', ');
    // สูตรเก่า (ก่อน 61b19fe): ฐานเต็ม, trip_pay ?? 10%, เบิก = withdraw ถ้า > 0 (ใบเบิกที่อนุมัติ = 0 แถวใน DB), ไม่มี start_date
    const oldComm = trips.reduce((x, t) => x + (t.trip_pay != null ? Number(t.trip_pay) : 0), 0);
    const oldAdv = trips.reduce((x, t) => x + (Number(t.withdraw) || 0), 0);
    const oldNet = Math.round(((Number(d.base_salary) || 0) + oldComm - oldAdv - (Number(d.social_security) || 0)) * 100) / 100;
    console.log(`sim ${ym} ${String(d.nickname)} [${p.status}] แสดง=${shown ? 'ใช่' : 'ไม่'} auto-sync=${sync ? 'ใช่' : 'ไม่'} | สุทธิ เก็บไว้ ${p.net_pay} สูตรเก่า ${oldNet} สูตรใหม่ ${fresh.net_pay}${Math.abs(oldNet - fresh.net_pay) < 0.005 ? ' (เก่า=ใหม่)' : ' (ต่างจากสูตรเก่า)'} | ${diff || 'ไม่เปลี่ยน'}`);
  }
  // สลิป: สูตรเดิม (fd07481: calcNetPay(ค่าเที่ยว, ฐานตามเดือน, เบิก, ประกันสังคม)) เทียบสูตรใหม่ (calcPayroll + รายได้/หักอื่นจากใบเงินเดือน)
  // เดือนที่ใบไม่มีรายได้/หักอื่น ต้องเท่าเดิมทุกบาท
  const { calcNetPay } = await import('../src/lib/utils.ts');
  for (const ym of months) {
    const b = monthBounds(ym);
    for (const d of sim.drivers.filter(x => isCountedDriver(x as never))) {
      const trips = sim.trips.filter(t => t.driver_id === d.id && String(t.date) >= b.from && String(t.date) <= b.to);
      const totals = calculateTotals(trips as never);
      const base = baseForMonth(d as never, ym);
      const before = calcNetPay(totals.trip_pay, base.base_salary, totals.withdraw, base.social_security);
      const pr = sim.payrolls.find(p => p.driver_id === d.id && p.month_year === ym);
      const extra = { other_additions: Number(pr?.other_additions) || 0, other_deductions: Number(pr?.other_deductions) || 0 };
      const after = calcPayroll({ driver: d as never, month_year: ym, trips: trips as never, ...extra }).net_pay;
      const expected = Math.round((before + extra.other_additions - extra.other_deductions) * 100) / 100;
      const ok = Math.abs(after - expected) < 0.005;
      if (ok) pass++; else fail++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  สลิป ${ym} ${String(d.nickname)}: ก่อน ${before} หลัง ${after} (รายได้อื่น ${extra.other_additions} หักอื่น ${extra.other_deductions})${extra.other_additions || extra.other_deductions ? '' : ' — ต้องเท่าเดิม'}`);
    }
  }
  // จำลองค่าของเอก (CEO 2026-10-06: start_date 2026-05-26, base_salary_start 2026-09-01) — ใส่ค่าในหน่วยความจำเท่านั้น ไม่เขียน DB
  // เทียบรายงาน/ใบเงินเดือนของเอกแต่ละเดือน: ค่าใน DB ตอนนี้ vs ถ้าตั้งค่าแล้ว
  const EK_ID = '72fc8e4d-1a25-49dd-bd2a-e5fcdc30c109';
  const EK_SET = { start_date: '2026-05-26', base_salary_start: '2026-09-01' };
  const ekMonths = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  for (const ym of ekMonths) {
    const d = cache[ym] ??= loadMonth(ym);
    const withEk = (d.trips as Record<string, unknown>[]).map(t => t.driver_id === EK_ID
      ? { ...t, drivers: { ...(t.drivers as object), ...EK_SET } } : t);
    const args = { month_year: ym, dateFrom: `${ym}-01`, dateTo: lastDayOf(ym), todayDate: '2026-10-05', fixedExpenses: d.fixed, expenses: d.expenses };
    const now = buildMonthlyReport({ ...args, trips: d.trips }).totals;
    const set = buildMonthlyReport({ ...args, trips: withEk as never }).totals;
    const ekDrv = sim.drivers.find(x => x.id === EK_ID)!;
    const b = monthBounds(ym);
    const ekTrips = sim.trips.filter(t => t.driver_id === EK_ID && String(t.date) >= b.from && String(t.date) <= b.to);
    const pNow = calcPayroll({ driver: ekDrv as never, month_year: ym, trips: ekTrips as never });
    const pSet = calcPayroll({ driver: { ...ekDrv, ...EK_SET } as never, month_year: ym, trips: ekTrips as never });
    const stored = sim.payrolls.find(p => p.driver_id === EK_ID && p.month_year === ym);
    console.log(`ek-sim ${ym}: เที่ยว ${ekTrips.length} | ฐาน ${pNow.base_salary}→${pSet.base_salary} ปกส ${pNow.social_security}→${pSet.social_security} สุทธิเอก ${pNow.net_pay}→${pSet.net_pay}`
      + `${stored ? ` (ใบที่บันทึก [${stored.status}] ฐาน ${stored.base_salary} สุทธิ ${stored.net_pay})` : ' (ไม่มีใบ)'}`
      + ` | dashboard ${now.net_profit}→${set.net_profit} | รายงาน ${now.net_after_fixed}→${set.net_after_fixed}`);
  }
  console.log(`\nรวม: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);
}
process.exitCode = fail ? 1 : 0;
