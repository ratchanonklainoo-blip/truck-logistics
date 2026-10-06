// GET /api/reports/trip-profit?month_year=YYYY-MM[&margin=10] — กำไรรายเที่ยว/รายวัน (อ่านอย่างเดียว ไม่มีการเขียน DB)
// สูตรอยู่ที่ lib/tripProfit.ts ; ดึงเที่ยวย้อนก่อนต้นเดือน 60 วัน เพื่อหาอัตราประมาณการและน้ำมันที่ยกมาจากวันไม่มีเที่ยว
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/fetchAll';
import { buildTripProfit, type TPRow } from '@/lib/tripProfit';

export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month_year = searchParams.get('month_year') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month_year)) {
    return NextResponse.json({ error: 'month_year (YYYY-MM) required' }, { status: 400 });
  }
  const marginPct = Number(searchParams.get('margin') ?? 10);
  if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 1000) {
    return NextResponse.json({ error: 'margin ต้องเป็น 0–1000 (%)' }, { status: 400 });
  }

  const [y, m] = month_year.split('-').map(Number);
  const from = `${month_year}-01`;
  const to = `${month_year}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const lookFrom = new Date(Date.UTC(y, m - 1, 1 - LOOKBACK_DAYS)).toISOString().slice(0, 10);

  const { data, error } = await fetchAllRows<TPRow>((a, b) => supabase
    .from('trips')
    .select(`
      id, date, driver_id, origin, destination, product, plate, odometer_start, odometer_end,
      transport_price, trip_pay, fuel_cost, fuel_litres, other_cost, other_item, remarks, receipt_image_url, created_at,
      drivers!trips_driver_id_fkey(id, name, nickname, license_plate, is_active, deleted_at, start_date, end_date)
    `)
    .gte('date', lookFrom)
    .lte('date', to)
    .is('deleted_at', null)
    .order('date', { ascending: true })
    .order('id', { ascending: true })
    .range(a, b) as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = buildTripProfit(data, { from, to, margin: marginPct / 100 });
  return NextResponse.json({ data: { month_year, ...result } });
}
