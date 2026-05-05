// ============================================================
// Advance Request Actions
// PATCH /api/advances/[id]  action: approve | reject | pay
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pushMessage, REPLIES } from '@/lib/line/client';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, notes } = body;

  // Fetch advance (no auto-join — fetch driver separately)
  const { data: advance, error: fetchErr } = await supabase
    .from('advance_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !advance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch driver separately
  let driverLineId: string | null = null;
  let driverName = '';
  if (advance.driver_id) {
    const { data: dr } = await supabase
      .from('drivers')
      .select('id, name, line_user_id')
      .eq('id', advance.driver_id)
      .single();
    if (dr) { driverLineId = dr.line_user_id; driverName = dr.name; }
  }

  if (action === 'approve') {
    if (advance.status !== 'pending') {
      return NextResponse.json({ error: 'Already processed' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        ...(notes && { notes }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (driverLineId) {
      await pushMessage(driverLineId, [REPLIES.advanceApproved(advance.amount)]).catch(() => {});
    }

    return NextResponse.json({ data });
  }

  if (action === 'reject') {
    if (advance.status !== 'pending') {
      return NextResponse.json({ error: 'Already processed' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        ...(notes && { notes }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (driverLineId) {
      await pushMessage(driverLineId, [REPLIES.advanceRejected()]).catch(() => {});
    }

    return NextResponse.json({ data });
  }

  if (action === 'pay') {
    if (advance.status !== 'approved') {
      return NextResponse.json({ error: 'Must be approved first' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'paid',
        paid_by: user.id,
        paid_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}