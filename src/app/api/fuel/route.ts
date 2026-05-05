// ============================================================
// GET /api/fuel — List fuel events
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const status = searchParams.get('status');
  const driver_id = searchParams.get('driver_id');
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');

  let query = supabase
    .from('fuel_events')
    .select(`
      *,
      driver:drivers(id, name, nickname, license_plate)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (driver_id) query = query.eq('driver_id', driver_id);
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', date_to + 'T23:59:59');

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
