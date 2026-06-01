import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizePlate(plate: string | null | undefined): string {
  if (!plate) return '';
  return plate
    .replace(/[฀-๿]+/g, '')
    .replace(/[/\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month_year = searchParams.get('month_year');
  if (!month_year) return NextResponse.json({ error: 'month_year required' }, { status: 400 });

  const [yearStr, monthStr] = month_year.split('-');
  const dateFrom = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const dateTo = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const { data: trips, error: tripsErr } = await supabase
    .from('trips')
    .select(`
      driver_id, transport_price, trip_pay, fuel_cost, fuel_litres,
      distance, other_cost, withdraw,
      drivers!trips_driver_id_fkey(id, name, nickname, license_plate, base_salary, social_security)
    `)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .is('deleted_at', null);

  if (tripsErr) return NextResponse.json({ error: tripsErr.message }, { status: 500 });

  const { data: fixedExpenses } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('is_active', true)
    .is('deleted_at', null);

  type DriverSummary = {
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
    total_withdraw: number;
    total_commission: number;
    gross_driver_cost: number;
    net_profit: number;
    fuel_efficiency: number;
    avg_fuel_price_per_litre: number;
    truck_fixed_cost: number;
    net_profit_after_fixed: number;
  };

  const summaryMap: Record<string, DriverSummary> = {};

  for (const t of (trips || [])) {
    const dr = (t as any).drivers;
    if (!dr) continue;
    const did = t.driver_id;
    if (!summaryMap[did]) {
      summaryMap[did] = {
        driver_id: did,
        driver_name: dr.name,
        driver_nickname: dr.nickname,
        truck_license_plate: dr.license_plate || '',
        base_salary: dr.base_salary || 0,
        social_security: dr.social_security || 0,
        trip_count: 0,
        total_revenue: 0,
        total_fuel_cost: 0,
        total_fuel_litres: 0,
        total_distance: 0,
        total_other_cost: 0,
        total_withdraw: 0,
        total_commission: 0,
        gross_driver_cost: 0,
        net_profit: 0,
        fuel_efficiency: 0,
        avg_fuel_price_per_litre: 0,
        truck_fixed_cost: 0,
        net_profit_after_fixed: 0,
      };
    }
    const s = summaryMap[did];
    s.trip_count += 1;
    s.total_revenue += t.transport_price || 0;
    s.total_fuel_cost += t.fuel_cost || 0;
    s.total_fuel_litres += t.fuel_litres || 0;
    s.total_distance += t.distance || 0;
    s.total_other_cost += t.other_cost || 0;
    s.total_withdraw += t.withdraw || 0;
    // Use explicit trip_pay if set (even 0 = no commission).
    // Only fallback to 10% if trip_pay is null/undefined (legacy data).
    const commission = (t.trip_pay != null)
      ? t.trip_pay
      : (t.transport_price || 0) * 0.10;
    s.total_commission += commission;
  }

  const enrichedFixed = (fixedExpenses || []).map(fe => ({
    ...fe,
    remaining_installments: fe.total_installments !== null
      ? Math.max(0, fe.total_installments - fe.paid_installments)
      : null,
  }));

  // Finalise per-driver base numbers
  const rawSummaries = Object.values(summaryMap).map(s => {
    s.total_commission = Math.round(s.total_commission * 100) / 100;
    s.gross_driver_cost = Math.round((s.base_salary + s.total_commission) * 100) / 100;
    s.net_profit = Math.round(
      (s.total_revenue - s.total_fuel_cost - s.total_other_cost - s.gross_driver_cost) * 100
    ) / 100;
    s.fuel_efficiency = s.total_fuel_litres > 0
      ? Math.round((s.total_distance / s.total_fuel_litres) * 100) / 100
      : 0;
    s.avg_fuel_price_per_litre = s.total_fuel_litres > 0
      ? Math.round((s.total_fuel_cost / s.total_fuel_litres) * 100) / 100
      : 0;
    return s;
  });

  // Assign truck fixed costs — each truck plate only assigned once,
  // to the driver with the most trips (busiest driver wins).
  const assignedPlates = new Set<string>();
  const sortedForAssign = [...rawSummaries].sort((a, b) => b.trip_count - a.trip_count);

  for (const s of sortedForAssign) {
    const norm = normalizePlate(s.truck_license_plate);
    if (!norm || assignedPlates.has(norm)) {
      s.truck_fixed_cost = 0;
      s.net_profit_after_fixed = s.net_profit;
      continue;
    }
    const truckFixed = enrichedFixed.filter(
      fe => fe.is_active && normalizePlate(fe.truck_license_plate) === norm
    );
    s.truck_fixed_cost = Math.round(truckFixed.reduce((acc, fe) => acc + fe.amount, 0) * 100) / 100;
    s.net_profit_after_fixed = Math.round((s.net_profit - s.truck_fixed_cost) * 100) / 100;
    if (s.truck_fixed_cost > 0) assignedPlates.add(norm);
  }

  const driverSummaries: DriverSummary[] = rawSummaries;

  const totals = driverSummaries.reduce(
    (acc, s) => ({
      total_revenue:     acc.total_revenue     + s.total_revenue,
      total_fuel_cost:   acc.total_fuel_cost   + s.total_fuel_cost,
      total_other_cost:  acc.total_other_cost  + s.total_other_cost,
      total_driver_cost: acc.total_driver_cost + s.gross_driver_cost,
      net_profit:        acc.net_profit         + s.net_profit,
      trip_count:        acc.trip_count         + s.trip_count,
      total_distance:    acc.total_distance     + s.total_distance,
      total_fuel_litres: acc.total_fuel_litres  + s.total_fuel_litres,
    }),
    {
      total_revenue: 0, total_fuel_cost: 0, total_other_cost: 0,
      total_driver_cost: 0, net_profit: 0, trip_count: 0,
      total_distance: 0, total_fuel_litres: 0,
    }
  );

  const fixedTotal = enrichedFixed.reduce((s, fe) => s + fe.amount, 0);
  const avgFuelPrice = totals.total_fuel_litres > 0
    ? Math.round((totals.total_fuel_cost / totals.total_fuel_litres) * 100) / 100
    : 0;

  return NextResponse.json({
    data: {
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
    },
  });
}
