import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidLat, isValidLng } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const driver_id = searchParams.get('driver_id');
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');

  let query = supabase
    .from('jobs')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (status && status !== 'all') query = query.eq('status', status);
  if (driver_id) query = query.eq('assigned_driver_id', driver_id);
  if (date_from) query = query.gte('date', date_from);
  if (date_to) query = query.lte('date', date_to);

  const { data: jobs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch related data separately (no FK constraints)
  const driverIds = Array.from(new Set((jobs || []).map(j => j.assigned_driver_id).filter(Boolean)));
  const customerIds = Array.from(new Set((jobs || []).map(j => j.customer_id).filter(Boolean)));

  const [{ data: drivers }, { data: customers }] = await Promise.all([
    driverIds.length > 0
      ? supabase.from('drivers').select('id, name, nickname').in('id', driverIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? supabase.from('customers').select('id, name').in('id', customerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const drMap: Record<string, { id: string; name: string; nickname: string }> = {};
  (drivers || []).forEach(d => { drMap[d.id] = d; });
  const cuMap: Record<string, { id: string; name: string }> = {};
  (customers || []).forEach(c => { cuMap[c.id] = c; });

  const enriched = (jobs || []).map(j => ({
    ...j,
    driver: j.assigned_driver_id ? drMap[j.assigned_driver_id] || null : null,
    customer: j.customer_id ? cuMap[j.customer_id] || null : null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, customer_id, origin, destination, product, weight_kg,
          selling_price, source, payment_type, payment_due_date,
          assigned_driver_id, notes,
          origin_lat, origin_lng, destination_lat, destination_lng } = body;

  if (!origin || !destination || selling_price === undefined) {
    return NextResponse.json({ error: 'origin, destination, selling_price required' }, { status: 400 });
  }
  if (payment_type === 'credit' && !payment_due_date) {
    return NextResponse.json({ error: 'payment_due_date required for credit jobs' }, { status: 400 });
  }
  for (const [lat, lng] of [[origin_lat, origin_lng], [destination_lat, destination_lng]] as const) {
    if (lat != null && !isValidLat(Number(lat))) {
      return NextResponse.json({ error: 'invalid latitude (must be -90..90)' }, { status: 400 });
    }
    if (lng != null && !isValidLng(Number(lng))) {
      return NextResponse.json({ error: 'invalid longitude (must be -180..180)' }, { status: 400 });
    }
  }

  const status = assigned_driver_id ? 'assigned' : 'new';

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      date: date || new Date().toISOString().slice(0, 10),
      customer_id: customer_id || null,
      origin, destination, product,
      origin_lat: origin_lat ?? null,
      origin_lng: origin_lng ?? null,
      destination_lat: destination_lat ?? null,
      destination_lng: destination_lng ?? null,
      weight_kg: weight_kg || null,
      selling_price,
      source: source || 'bank',
      payment_type: payment_type || 'on_completion',
      payment_due_date: payment_due_date || null,
      assigned_driver_id: assigned_driver_id || null,
      status,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
