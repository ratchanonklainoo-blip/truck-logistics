import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Floor to nearest 10 (NEVER round up)
function floorTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month_year = searchParams.get('month_year');
  const driver_id = searchParams.get('driver_id');

  let query = supabase
    .from('payrolls').select('*').is('deleted_at', null)
    .order('month_year', { ascending: false });

  if (month_year) query = query.eq('month_year', month_year);
  if (driver_id) query = query.eq('driver_id', driver_id);

  const { data: payrolls, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const driverIds = [...new Set((payrolls || []).map(p => p.driver_id).filter(Boolean))];
  let drMap: Record<string, { id: string; name: string; nickname: string; base_salary: number }> = {};
  if (driverIds.length > 0) {
    const { data: drs } = await supabase.from('drivers').select('id,name,nickname,base_salary').in('id', driverIds);
    (drs || []).forEach(d => { drMap[d.id] = d; });
  }

  const enriched = (payrolls || []).map(p => ({
    ...p,
    driver: drMap[p.driver_id] || null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { driver_id, month_year } = body;

  if (!driver_id || !month_year) {
    return NextResponse.json({ error: 'driver_id and month_year required' }, { status: 400 });
  }

  // Get driver base info
  const { data: driver } = await supabase
    .from('drivers').select('*').eq('id', driver_id).single();
  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  // Get trips for this driver/month
  const [yearStr, monthStr] = month_year.split('-');
  const dateFrom = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const dateTo = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const { data: trips } = await supabase
    .from('trips')
    .select('transport_price, trip_pay, distance, fuel_litres')
    .eq('driver_id', driver_id)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .is('deleted_at', null);

  // Get approved/paid advances
  const { data: advances } = await supabase
    .from('advance_requests')
    .select('amount')
    .eq('driver_id', driver_id)
    .eq('month_year', month_year)
    .in('status', ['approved', 'paid'])
    .is('deleted_at', null);

  const tripList = trips || [];
  const advanceList = advances || [];

  // commission = sum(transport_price * 0.10) but we use trip_pay if set
  const totalCommission = tripList.reduce((s, t) => {
    return s + (t.trip_pay > 0 ? t.trip_pay : t.transport_price * 0.10);
  }, 0);
  const totalAdvance = advanceList.reduce((s, a) => s + a.amount, 0);
  const totalDistance = tripList.reduce((s, t) => s + (t.distance || 0), 0);
  const tripCount = tripList.length;

  const baseSalary = driver.base_salary || 0;
  const socialSecurity = driver.social_security || 0;

  const grossPay = baseSalary + totalCommission;
  const netPayRaw = grossPay - totalAdvance - socialSecurity;
  const netPay = floorTen(Math.max(0, netPayRaw));

  // Upsert payroll record
  const { data, error } = await supabase
    .from('payrolls')
    .upsert({
      driver_id,
      month_year,
      base_salary: baseSalary,
      total_commission: Math.round(totalCommission * 100) / 100,
      total_advance: totalAdvance,
      social_security: socialSecurity,
      other_deductions: 0,
      other_additions: 0,
      gross_pay: Math.round(grossPay * 100) / 100,
      net_pay: netPay,
      trip_count: tripCount,
      total_distance: Math.round(totalDistance * 100) / 100,
      status: 'draft',
    }, { onConflict: 'driver_id,month_year' })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
