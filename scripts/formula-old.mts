// สำเนาสูตร "ก่อนแก้" ของ /api/reports/monthly (commit 1bd70ff) — ใช้เป็น baseline เทียบกับสูตรใหม่เท่านั้น
// ไม่ได้ถูกใช้ในแอป
import { isRealTrip } from '../src/lib/tripCount.ts';
import { fixedExpenseStatusForMonth } from '../src/lib/fixedExpenses.ts';

const normalizePlate = (p: string | null | undefined) => !p ? '' : p
  .replace(/[฀-๿]+/g, '').replace(/[/\s]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').trim();

export function oldMonthlyReport(snap: any, month_year: string) {
  const [y, m] = month_year.split('-');
  const from = `${y}-${m}-01`;
  const to = `${y}-${m}-${String(new Date(Number(y), Number(m), 0).getDate()).padStart(2, '0')}`;
  const drById: Record<string, any> = Object.fromEntries(snap.drivers.map((d: any) => [d.id, d]));
  const trips = snap.trips.filter((t: any) => t.date >= from && t.date <= to);
  const exp = (snap.expenses || []).filter((e: any) => e.date >= from && e.date <= to);
  const drExp: Record<string, number> = {};
  for (const e of exp) if (e.driver_id) drExp[e.driver_id] = (drExp[e.driver_id] || 0) + (e.amount || 0);
  const map: Record<string, any> = {}; const rowCounts: Record<string, number> = {};
  for (const t of trips) {
    const dr = drById[t.driver_id];
    if (!dr || dr.deleted_at || dr.is_active === false) continue;
    const s = map[t.driver_id] ??= { driver_id: t.driver_id, plate: dr.license_plate || '', base_salary: dr.base_salary || 0,
      trip_count: 0, rev: 0, fuel: 0, other: 0, extra: 0, withdraw: 0, commission: 0 };
    s.trip_count += isRealTrip(t) ? 1 : 0; rowCounts[t.driver_id] = (rowCounts[t.driver_id] || 0) + 1;
    s.rev += Number(t.transport_price) || 0; s.fuel += Number(t.fuel_cost) || 0; s.other += Number(t.other_cost) || 0;
    s.withdraw += Number(t.withdraw) || 0;
    s.commission += t.trip_pay != null ? Number(t.trip_pay) : (Number(t.transport_price) || 0) * 0.10;
  }
  const fixed = snap.fixed_expenses.filter((fe: any) => fixedExpenseStatusForMonth(fe, month_year).active);
  const list = Object.values(map).map((s: any) => {
    s.extra = Math.round((drExp[s.driver_id] || 0) * 100) / 100;
    s.commission = Math.round(s.commission * 100) / 100;
    s.driver_cost = Math.round((s.base_salary + s.commission) * 100) / 100;
    s.net_profit = Math.round((s.rev - s.fuel - s.other - s.extra - s.driver_cost) * 100) / 100;
    return s;
  });
  const t = list.reduce((a: any, s: any) => ({ rev: a.rev + s.rev, fuel: a.fuel + s.fuel, other: a.other + s.other, extra: a.extra + s.extra,
    driver_cost: a.driver_cost + s.driver_cost, net_profit: a.net_profit + s.net_profit, trips: a.trips + s.trip_count }),
    { rev: 0, fuel: 0, other: 0, extra: 0, driver_cost: 0, net_profit: 0, trips: 0 });
  const fixedTotal = fixed.reduce((s: number, fe: any) => s + Number(fe.amount), 0);
  void normalizePlate; void rowCounts;
  return { ...t, fixed: fixedTotal, net_after_fixed: Math.round((t.net_profit - fixedTotal) * 100) / 100 };
}
