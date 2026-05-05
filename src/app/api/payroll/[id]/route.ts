import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, ...rest } = body;

  const { data: payroll } = await supabase.from('payrolls').select('status').eq('id', id).single();
  if (!payroll) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'approve') {
    if (payroll.status !== 'draft') return NextResponse.json({ error: 'Must be draft' }, { status: 409 });
    const { data, error } = await supabase.from('payrolls')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'pay') {
    if (payroll.status !== 'approved') return NextResponse.json({ error: 'Must be approved' }, { status: 409 });
    const { data, error } = await supabase.from('payrolls')
      .update({ status: 'paid', paid_by: user.id, paid_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // General edit (adjustments)
  const { data, error } = await supabase.from('payrolls').update(rest).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
