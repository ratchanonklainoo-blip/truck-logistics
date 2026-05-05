// ============================================================
// POST /api/line/send — Push message to driver
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/client';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { driver_id, message } = await req.json();
  if (!driver_id || !message) {
    return NextResponse.json({ error: 'driver_id and message required' }, { status: 400 });
  }

  const { data: driver } = await supabase
    .from('drivers')
    .select('line_user_id, name')
    .eq('id', driver_id)
    .single();

  if (!driver?.line_user_id) {
    return NextResponse.json({ error: 'Driver has no LINE account linked' }, { status: 404 });
  }

  await pushMessage(driver.line_user_id, [{ type: 'text', text: message }]);

  return NextResponse.json({ data: { sent: true } });
}
