// ทดสอบสูตรกลาง (payrollCalc + monthlyReport) ตามชุดทดสอบ 23 ข้อของ Fern (formula-audit-2026-10-05.md)
// รัน:  node --import ./scripts/ts-hooks.mjs scripts/test-formula.mts            (เฉพาะ unit test ไม่แตะ DB)
//       node --import ./scripts/ts-hooks.mjs scripts/test-formula.mts --live     (+ ดึงข้อมูลจริงแบบ SELECT เทียบกับสูตรเก่า)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isRealTrip, countRealTrips } from '../src/lib/tripCount.ts';
import {
  tripPayOf, calcPayroll, baseForMonth, isEmployedInMonth, monthBounds, payrollChangedFields,
} from '../src/lib/payrollCalc.ts';
import { buildMonthlyReport } from '../src/lib/monthlyReport.ts';
import { calculateTotals } from '../src/lib/utils.ts';

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
// 21 จ่ายสด: withdraw = trip_pay → สุทธิไม่รวม 700 นี้
eq('#21 จ่ายสด 700 → สุทธิ = ฐาน − ประกันสังคม', calcPayroll({ driver: DR, month_year: '2026-06', trips: [trip({ withdraw: 700 })] }).net_pay, 5000 - 435);
eq('#21 รายงานกำไรไม่หักเงินเบิก', report('2026-06', [trip({ withdraw: 700 })]).totals.net_profit, report('2026-06', [trip()]).totals.net_profit);
// 22 ทศนิยม: เก็บ 2 ตำแหน่ง ไม่ปัดลงหลักสิบ (สูตรเดิม)
eq('#22 net 4,656.50 เก็บตามจริง', calcPayroll({ driver: { ...DR, base_salary: 0, social_security: 0 }, month_year: '2026-06', trips: [trip({ trip_pay: 4656.5 })] }).net_pay, 4656.5);
// ทะเบียน: trips.plate ถ้ามี ไม่มีใช้ทะเบียนคนขับ
eq('ทะเบียนรายงาน: ไม่มี plate → ทะเบียนคนขับ', report('2026-06', [trip()]).driver_summaries[0].truck_license_plate, DR.license_plate);
eq('ทะเบียนรายงาน: plate ส่วนใหญ่ของเดือน', report('2026-06', [trip({ plate: '71-1833' }), trip({ plate: '71-1833' }), trip()]).driver_summaries[0].truck_license_plate, '71-1833');

console.log('ไม่ทดสอบในสคริปต์นี้ (เป็นหน้าจอ/คิวรี): #8 วันที่เริ่มต้นฟอร์ม, #9–#11 ค่าประจำ (scripts/test-fixed-expenses.mts), #17 snapshot ฐานในใบเงินเดือน, #19 คนขับไม่มีเที่ยว, #20 เตือนซ้ำ, #23 เกิน 1,000 แถว (scripts/verify-m4-live.mts)');
console.log(`\nunit: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);

// ── เทียบกับข้อมูลจริง (SELECT อย่างเดียว) ──
if (process.argv.includes('--live')) {
  const { loadMonth, lastDayOf } = await import('./live-report.mts');
  const { oldMonthlyReport } = await import('./formula-old.mts');
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-09', '2026-10'];
  const cacheFile = path.join(tmpdir(), 'truck-formula-live-cache.json');
  const cache: Record<string, ReturnType<typeof loadMonth>> = process.argv.includes('--refresh') || !existsSync(cacheFile)
    ? {} : JSON.parse(readFileSync(cacheFile, 'utf8'));
  for (const ym of months) {
    const d = cache[ym] ??= loadMonth(ym);
    const rep = buildMonthlyReport({ month_year: ym, dateFrom: `${ym}-01`, dateTo: lastDayOf(ym), todayDate: '2026-10-05',
      trips: d.trips, fixedExpenses: d.fixed, expenses: d.expenses });
    const old = oldMonthlyReport({ drivers: d.drivers, trips: d.trips, expenses: d.expenses, fixed_expenses: d.fixed }, ym);
    const t = rep.totals;
    const same = Math.abs(t.net_profit - old.net_profit) < 0.005 && Math.abs(t.net_after_fixed - old.net_after_fixed) < 0.005
      && t.trip_count === old.trips && Math.abs(t.total_revenue - old.rev) < 0.005;
    if (same) pass++; else fail++;
    console.log(`${same ? 'PASS' : 'FAIL'}  live ${ym}: กำไร dashboard เก่า ${old.net_profit} ใหม่ ${t.net_profit} | รายงาน เก่า ${old.net_after_fixed} ใหม่ ${t.net_after_fixed} | เที่ยว ${old.trips}/${t.trip_count}`);
  }
  writeFileSync(cacheFile, JSON.stringify(cache));
  console.log(`\nรวม: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);
}
process.exitCode = fail ? 1 : 0;
