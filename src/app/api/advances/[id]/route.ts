// ============================================================
// Advance Request Actions
// PATCH /api/advances/[id]  action: approve | reject | pay
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/client';
import { REPLIES } from '@/lib/line/client';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: dbUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 403 });

  const body = await req.json();
  const { action, notes } = body;

  const { data: advance } = await supabase
    .from('advance_requests')
    .select('*, driver:drivers(id, name, line_user_id)')
    .eq('id', id)
    .single();

  if (!advance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const driver = advance.driver as { id: string; name: string; line_user_id: string | null };

  if (action === 'approve') {
    if (!['bank', 'mother', 'admin'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Only Bank/Mother can approve' }, { status: 403 });
    }
    if (advance.status !== 'pending') {
      return NextResponse.json({ error: 'Already processed' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'approved',
        approved_by: dbUser.id,
        approved_at: new Date().toISOString(),
        ...(notes && { notes }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify driver
    if (driver?.line_user_id) {
      await pushMessage(driver.line_user_id, [REPLIES.advanceApproved(advance.amount)]);
    }

    return NextResponse.json({ data });
  }

  if (action === 'reject') {
    if (!['bank', 'mother', 'admin'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Only Bank/Mother can reject' }, { status: 403 });
    }
    if (advance.status !== 'pending') {
      return NextResponse.json({ error: 'Already processed' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'rejected',
        approved_by: dbUser.id,
        approved_at: new Date().toISOString(),
        ...(notes && { notes }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (driver?.line_user_id) {
      await pushMessage(driver.line_user_id, [REPLIES.advanceRejected()]);
    }

    return NextResponse.json({ data });
  }

  if (action === 'pay') {
    if (!['mother', 'bank', 'admin'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Only Mother can mark as paid' }, { status: 403 });
    }
    if (advance.status !== 'approved') {
      return NextResponse.json({ error: 'Must be approved first' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('advance_requests')
      .update({
        status: 'paid',
        paid_by: dbUser.id,
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
