import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const is_read = searchParams.get('is_read');
  const type = searchParams.get('type');

  let query = supabase
    .from('alerts').select('*').order('created_at', { ascending: false }).limit(100);

  if (is_read !== null) query = query.eq('is_read', is_read === 'true');
  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, severity, title, message, driver_id, job_id, fuel_event_id, customer_id, metadata } = body;

  if (!type || !title || !message) {
    return NextResponse.json({ error: 'type, title, message required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('alerts')
    .insert({ type, severity: severity || 'warning', title, message,
              driver_id: driver_id || null, job_id: job_id || null,
              fuel_event_id: fuel_event_id || null, customer_id: customer_id || null,
              metadata: metadata || null })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
