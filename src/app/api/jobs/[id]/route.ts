import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_TRANSITIONS: Record<string, string[]> = {
  new:             ['waiting_driver'],
  waiting_driver:  ['assigned'],
  assigned:        ['driver_accepted', 'waiting_driver'],
  driver_accepted: ['in_progress'],
  in_progress:     ['delivered'],
  delivered:       ['waiting_payment'],
  waiting_payment: ['closed'],
  closed:          [],
};

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job, error } = await supabase
    .from('jobs').select('*').eq('id', id).single();
  if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [dr, cu] = await Promise.all([
    job.assigned_driver_id
      ? supabase.from('drivers').select('id,name,nickname,license_plate').eq('id', job.assigned_driver_id).single()
      : Promise.resolve({ data: null }),
    job.customer_id
      ? supabase.from('customers').select('id,name,phone,payment_type').eq('id', job.customer_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({ data: { ...job, driver: dr.data, customer: cu.data } });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, status: newStatus, assigned_driver_id, notes, profit, ...rest } = body;

  const { data: job, error: fetchErr } = await supabase
    .from('jobs').select('*').eq('id', id).single();
  if (fetchErr || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Status transition
  if (newStatus) {
    const allowed = VALID_TRANSITIONS[job.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `Invalid transition: ${job.status} → ${newStatus}`,
        allowed,
      }, { status: 409 });
    }

    const update: Record<string, unknown> = { status: newStatus };
    if (assigned_driver_id) update.assigned_driver_id = assigned_driver_id;
    if (notes !== undefined) update.notes = notes;
    if (profit !== undefined) update.profit = profit;
    if (newStatus === 'closed') {
      update.closed_by = user.id;
      update.closed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('jobs').update(update).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // General update (edit fields)
  const { data, error } = await supabase
    .from('jobs').update({ ...rest, ...(notes !== undefined && { notes }) }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('jobs').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { deleted: true } });
}
