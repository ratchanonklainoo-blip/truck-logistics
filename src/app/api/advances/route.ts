// ============================================================
// GET  /api/advances — List advance requests
// POST /api/advances — Create advance request (web)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const status = searchParams.get('status');
  const driver_id = searchParams.get('driver_id');
  const month_year = searchParams.get('month_year');

  let query = supabase
    .from('advance_requests')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (driver_id) query = query.eq('driver_id', driver_id);
  if (month_year) query = query.eq('month_year', month_year);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch drivers separately (no FK constraint)
  const driverIds = [...new Set((data || []).map((a: { driver_id: string }) => a.driver_id).filter(Boolean))];
  let driversMap: Record<string, { id: string; name: string; nickname: string }> = {};
  if (driverIds.length > 0) {
    const { data: drs } = await supabase
      .from('drivers').select('id, name, nickname').in('id', driverIds);
    (drs || []).forEach((d: { id: string; name: string; nickname: string }) => { driversMap[d.id] = d; });
  }

  const enriched = (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    driver: driversMap[a.driver_id as string] || null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { driver_id, amount, reason } = body;

  if (!driver_id || !amount) {
    return NextResponse.json({ error: 'driver_id and amount required' }, { status: 400 });
  }

  const { data: driver } = await supabase
    .from('drivers')
    .select('monthly_advance_limit')
    .eq('id', driver_id)
    .single();

  const monthYear = new Date().toISOString().slice(0, 7);
  const limit = driver?.monthly_advance_limit || 5000;

  // Check monthly limit
  const { data: monthAdvances } = await supabase
    .from('advance_requests')
    .select('amount')
    .eq('driver_id', driver_id)
    .eq('month_year', monthYear)
    .in('status', ['approved', 'paid'])
    .is('deleted_at', null);

  const used = (monthAdvances || []).reduce((s, a) => s + a.amount, 0);
  if (used + amount > limit) {
    return NextResponse.json({
      error: `ยอดเบิกเกินวงเงิน (ใช้ไปแล้ว ${used} / ${limit} บาท)`,
      code: 'OVER_LIMIT',
    }, { status: 422 });
  }

  const { data, error } = await supabase
    .from('advance_requests')
    .insert({ driver_id, amount, reason, status: 'pending', requested_via: 'web', month_year: monthYear })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
