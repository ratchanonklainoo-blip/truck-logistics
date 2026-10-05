// คำนวณรายงานรายเดือน (ฟังก์ชันบริสุทธิ์) — ใช้โดย /api/reports/monthly และสคริปต์ตรวจตัวเลข
import { isRealTrip } from './tripCount';
import { fixedExpenseProgress, fixedExpenseStatusForMonth, type FixedExpenseLike } from './fixedExpenses';
import { tripPayOf, isCountedDriver, baseForMonth } from './payrollCalc';

export function normalizePlate(plate: string | null | undefined): string {
  if (!plate) return '';
  return plate
    .replace(/[฀-๿]+/g, '')
    .replace(/[/\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export interface ReportDriver {
  id: string; name: string; nickname: string; license_plate: string | null;
  base_salary: number | null; social_security: number | null;
  is_active: boolean | null; deleted_at: string | null;
  start_date?: string | null; end_date?: string | null;
}
export interface ReportTrip {
  driver_id: string; origin: string | null; destination: string | null;
  transport_price: number | null; trip_pay: number | null; fuel_cost: number | null; fuel_litres: number | null;
  distance: number | null; other_cost: number | null; withdraw: number | null;
  plate?: string | null; // ทะเบียนรถต่อเที่ยว (migration 022) ว่าง = ใช้ทะเบียนของคนขับ
  drivers: ReportDriver | null;
}
export interface ReportExpense { driver_id: string | null; amount: number | null; category?: string; description?: string | null; date?: string }
type FixedRow = FixedExpenseLike & { amount: number; truck_license_plate?: string | null } & Record<string, unknown>;

export interface DriverSummary {
  driver_id: string;
  driver_name: string;
  driver_nickname: string;
  truck_license_plate: string;
  base_salary: number;
  social_security: number;
  trip_count: number;
  total_revenue: number;
  total_fuel_cost: number;
  total_fuel_litres: number;
  total_distance: number;
  total_other_cost: number;
  total_extra_expenses: number;
  total_withdraw: number;
  total_commission: number;
  gross_driver_cost: number;
  net_profit: number;
  fuel_efficiency: number;
  avg_fuel_price_per_litre: number;
  truck_fixed_cost: number;
  net_profit_after_fixed: number;
}

export function buildMonthlyReport(input: {
  month_year: string; dateFrom: string; dateTo: string; todayDate: string;
  trips: ReportTrip[]; fixedExpenses: FixedRow[]; expenses: ReportExpense[];
}) {
  const { month_year, dateFrom, dateTo, todayDate, trips, fixedExpenses, expenses } = input;

  // Build driver→expenses map
  const driverExpensesMap: Record<string, number> = {};
  for (const e of expenses) {
    if (e.driver_id) {
      driverExpensesMap[e.driver_id] = (driverExpensesMap[e.driver_id] || 0) + (e.amount || 0);
    }
  }

  // Aggregate per driver
  const summaryMap: Record<string, DriverSummary> = {};
  const rowCounts: Record<string, number> = {}; // จำนวนแถวทั้งหมด ใช้จัดลำดับแจกค่าประจำรถ (คงลำดับเดิม ไม่ให้เงินเปลี่ยน)
  const plateCounts: Record<string, Record<string, number>> = {}; // ทะเบียนที่ใช้จริงต่อเที่ยว (trips.plate ‖ ทะเบียนคนขับ)

  for (const t of trips) {
    const dr = t.drivers;
    // ตัดเฉพาะเที่ยวของคนขับที่ถูกลบแบบเดิม (deleted_at) — คงตัวเลขเดือนที่แก้แล้ว
    // คนขับที่ "ปิดใช้งาน" ยังนับเงินของเดือนที่เขาทำงาน (ไม่แตะข้อมูลเที่ยวใน DB)
    if (!dr || !isCountedDriver(dr)) continue;
    const did = t.driver_id;
    if (!summaryMap[did]) {
      summaryMap[did] = {
        driver_id: did,
        driver_name: dr.name,
        driver_nickname: dr.nickname,
        truck_license_plate: dr.license_plate || '',
        // ฐาน/ประกันสังคมตามเดือน: เริ่มกลางเดือน = 0, นอกช่วงทำงาน = 0, นอกนั้นเต็ม (สูตรเดียวกับใบเงินเดือน)
        ...baseForMonth(dr, month_year),
        trip_count: 0, total_revenue: 0, total_fuel_cost: 0, total_fuel_litres: 0, total_distance: 0,
        total_other_cost: 0, total_extra_expenses: 0, total_withdraw: 0, total_commission: 0,
        gross_driver_cost: 0, net_profit: 0, fuel_efficiency: 0, avg_fuel_price_per_litre: 0,
        truck_fixed_cost: 0, net_profit_after_fixed: 0,
      };
    }
    const s = summaryMap[did];
    s.trip_count += isRealTrip(t) ? 1 : 0; // แถว '-'→'-' ไม่นับเป็นเที่ยว แต่เงินด้านล่างนับตามเดิม
    rowCounts[did] = (rowCounts[did] || 0) + 1;
    const plate = (t.plate || '').trim() || dr.license_plate || '';
    const pc = plateCounts[did] ??= {};
    pc[plate] = (pc[plate] || 0) + 1;
    s.total_revenue += t.transport_price || 0;
    s.total_fuel_cost += t.fuel_cost || 0;
    s.total_fuel_litres += t.fuel_litres || 0;
    s.total_distance += t.distance || 0;
    s.total_other_cost += t.other_cost || 0;
    s.total_withdraw += t.withdraw || 0;
    s.total_commission += tripPayOf(t);
  }

  // Attach extra expenses per driver + ทะเบียนที่ใช้มากที่สุดในเดือน (เท่ากันเลือกทะเบียนของคนขับก่อน)
  for (const did of Object.keys(summaryMap)) {
    summaryMap[did].total_extra_expenses = Math.round((driverExpensesMap[did] || 0) * 100) / 100;
    const own = summaryMap[did].truck_license_plate;
    const best = Object.entries(plateCounts[did] || {})
      .sort((a, b) => b[1] - a[1] || Number(b[0] === own) - Number(a[0] === own))[0];
    if (best) summaryMap[did].truck_license_plate = best[0];
  }

  // Enrich fixed expenses
  // นับเฉพาะรายการที่มีผลในเดือนที่ขอ: เริ่มแล้ว ยังไม่ผ่อนครบ ยังไม่เลยวันสิ้นสุด และรายปีนับเฉพาะเดือนที่จ่าย
  // งวดคงเหลือ/จ่ายแล้วคำนวณจากปฏิทิน ณ เดือนที่ขอ (ตรรกะเดียวกับหน้ารายการค่าใช้จ่ายประจำ)
  const enrichedFixed = fixedExpenses.flatMap(fe => {
    const status = fixedExpenseStatusForMonth(fe, month_year);
    if (!status.active) return [];
    const progress = fixedExpenseProgress(fe, month_year, todayDate);
    return [{ ...fe, installment_no: status.installment_no, remaining_installments: progress.remaining, progress }];
  });

  // Finalise per-driver + assign truck fixed costs (deduplicate shared plates)
  const rawSummaries = Object.values(summaryMap).map(s => {
    s.total_commission = Math.round(s.total_commission * 100) / 100;
    s.gross_driver_cost = Math.round((s.base_salary + s.total_commission) * 100) / 100;
    s.net_profit = Math.round(
      (s.total_revenue - s.total_fuel_cost - s.total_other_cost - s.total_extra_expenses - s.gross_driver_cost) * 100
    ) / 100;
    s.fuel_efficiency = s.total_fuel_litres > 0
      ? Math.round((s.total_distance / s.total_fuel_litres) * 100) / 100 : 0;
    s.avg_fuel_price_per_litre = s.total_fuel_litres > 0
      ? Math.round((s.total_fuel_cost / s.total_fuel_litres) * 100) / 100 : 0;
    return s;
  });

  const assignedPlates = new Set<string>();
  const sortedForAssign = [...rawSummaries].sort((a, b) => (rowCounts[b.driver_id] || 0) - (rowCounts[a.driver_id] || 0));

  for (const s of sortedForAssign) {
    const norm = normalizePlate(s.truck_license_plate);
    if (!norm || assignedPlates.has(norm)) {
      s.truck_fixed_cost = 0;
      s.net_profit_after_fixed = s.net_profit;
      continue;
    }
    const truckFixed = enrichedFixed.filter(fe => normalizePlate(fe.truck_license_plate) === norm);
    s.truck_fixed_cost = Math.round(truckFixed.reduce((acc, fe) => acc + fe.amount, 0) * 100) / 100;
    s.net_profit_after_fixed = Math.round((s.net_profit - s.truck_fixed_cost) * 100) / 100;
    if (s.truck_fixed_cost > 0) assignedPlates.add(norm);
  }

  const driverSummaries: DriverSummary[] = rawSummaries;

  // Company-wide totals
  const totals = driverSummaries.reduce(
    (acc, s) => ({
      total_revenue:     acc.total_revenue     + s.total_revenue,
      total_fuel_cost:   acc.total_fuel_cost   + s.total_fuel_cost,
      total_other_cost:  acc.total_other_cost  + s.total_other_cost,
      total_extra_expenses: acc.total_extra_expenses + s.total_extra_expenses,
      total_driver_cost: acc.total_driver_cost + s.gross_driver_cost,
      net_profit:        acc.net_profit         + s.net_profit,
      trip_count:        acc.trip_count         + s.trip_count,
      total_distance:    acc.total_distance     + s.total_distance,
      total_fuel_litres: acc.total_fuel_litres  + s.total_fuel_litres,
    }),
    {
      total_revenue: 0, total_fuel_cost: 0, total_other_cost: 0,
      total_extra_expenses: 0, total_driver_cost: 0, net_profit: 0,
      trip_count: 0, total_distance: 0, total_fuel_litres: 0,
    }
  );

  const fixedTotal = enrichedFixed.reduce((s, fe) => s + fe.amount, 0);
  const avgFuelPrice = totals.total_fuel_litres > 0
    ? Math.round((totals.total_fuel_cost / totals.total_fuel_litres) * 100) / 100 : 0;

  return {
    month_year,
    date_from: dateFrom,
    date_to: dateTo,
    driver_summaries: driverSummaries,
    fixed_expenses: enrichedFixed,
    totals: {
      ...totals,
      total_fixed_expenses: fixedTotal,
      net_after_fixed: Math.round((totals.net_profit - fixedTotal) * 100) / 100,
      avg_fuel_price_per_litre: avgFuelPrice,
    },
  };
}
