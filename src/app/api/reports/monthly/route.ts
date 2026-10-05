import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bangkokToday } from '@/lib/fixedExpenses';
import { buildMonthlyReport, type ReportTrip } from '@/lib/monthlyReport';

export const dynamic = 'force-dynamic';

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

  // 1. Trips
  const { data: trips, error: tripsErr } = await supabase
    .from('trips')
    .select(`
      driver_id, origin, destination, transport_price, trip_pay, fuel_cost, fuel_litres,
      distance, other_cost, withdraw, plate,
      drivers!trips_driver_id_fkey(id, name, nickname, license_plate, base_salary, social_security, is_active, deleted_at, start_date, end_date)
    `)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .is('deleted_at', null);

  if (tripsErr) return NextResponse.json({ error: tripsErr.message }, { status: 500 });

  // 2. Fixed expenses — ดึงทั้งที่ปิดรายการแล้วด้วย เพราะเดือนเก่าก่อน end_date ยังต้องนับ
  //    (ตัดสินว่านับเดือนนี้หรือไม่ด้วย fixedExpenseStatusForMonth)
  const { data: fixedExpenses } = await supabase
    .from('fixed_expenses')
    .select('*')
    .is('deleted_at', null);

  // 3. Expenses table — additional expenses in the month
  const { data: expensesData } = await supabase
    .from('expenses')
    .select('driver_id, amount, category, description, date')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .is('deleted_at', null);

  const data = buildMonthlyReport({
    month_year, dateFrom, dateTo, todayDate: bangkokToday().date,
    trips: (trips || []) as unknown as ReportTrip[],
    fixedExpenses: (fixedExpenses || []) as never,
    expenses: expensesData || [],
  });
  return NextResponse.json({ data });
}
