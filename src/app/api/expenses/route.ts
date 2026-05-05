import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driver_id = searchParams.get('driver_id');
  const job_id = searchParams.get('job_id');
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');
  const category = searchParams.get('category');

  let query = supabase
    .from('expenses').select('*').is('deleted_at', null)
    .order('date', { ascending: false }).limit(300);

  if (driver_id) query = query.eq('driver_id', driver_id);
  if (job_id) query = query.eq('job_id', job_id);
  if (date_from) query = query.gte('date', date_from);
  if (date_to) query = query.lte('date', date_to);
  if (category) query = query.eq('category', category);

  const { data: expenses, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with driver names
  const driverIds = [...new Set((expenses || []).map(e => e.driver_id).filter(Boolean))];
  let drMap: Record<string, { id: string; name: string; nickname: string }> = {};
  if (driverIds.length > 0) {
    const { data: drs } = await supabase.from('drivers').select('id,name,nickname').in('id', driverIds);
    (drs || []).forEach(d => { drMap[d.id] = d; });
  }

  const enriched = (expenses || []).map(e => ({
    ...e,
    driver: e.driver_id ? drMap[e.driver_id] || null : null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { job_id, trip_id, driver_id, category, description, amount, receipt_url, date } = body;

  if (!category || amount === undefined) {
    return NextResponse.json({ error: 'category and amount required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      job_id: job_id || null,
      trip_id: trip_id || null,
      driver_id: driver_id || null,
      category, description,
      amount: Number(amount),
      receipt_url: receipt_url || null,
      date: date || new Date().toISOString().slice(0, 10),
      recorded_by: user.id,
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
