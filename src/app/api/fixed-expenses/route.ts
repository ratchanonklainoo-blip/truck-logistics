import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const truck_license_plate = searchParams.get('truck_license_plate');
  const is_active = searchParams.get('is_active');

  let query = supabase
    .from('fixed_expenses')
    .select('*')
    .is('deleted_at', null)
    .order('category')
    .order('name');

  if (truck_license_plate) query = query.eq('truck_license_plate', truck_license_plate);
  if (is_active !== null) query = query.eq('is_active', is_active === 'true');

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute remaining_installments client-side (not stored in DB)
  const enriched = (data || []).map(fe => ({
    ...fe,
    remaining_installments: fe.total_installments !== null
      ? Math.max(0, fe.total_installments - (fe.paid_installments || 0))
      : null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    name, category, truck_license_plate, amount,
    total_installments, paid_installments, start_date,
    due_day, is_active, notes,
  } = body;

  if (!name || !category || !amount) {
    return NextResponse.json({ error: 'name, category, amount required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert({
      name,
      category,
      truck_license_plate: truck_license_plate || null,
      amount: Number(amount),
      total_installments: total_installments ? Number(total_installments) : null,
      paid_installments: Number(paid_installments ?? 0),
      start_date: start_date || null,
      due_day: due_day ? Number(due_day) : null,
      is_active: is_active !== false,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('fixed_expenses')
    .update({
      ...updates,
      amount: updates.amount !== undefined ? Number(updates.amount) : undefined,
      total_installments: updates.total_installments !== undefined
        ? (updates.total_installments ? Number(updates.total_installments) : null)
        : undefined,
      paid_installments: updates.paid_installments !== undefined
        ? Number(updates.paid_installments)
        : undefined,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('fixed_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
