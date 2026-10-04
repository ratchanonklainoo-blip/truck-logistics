import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('recurring_routes')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const name = String(body.name ?? '').trim();
  const origin = String(body.origin ?? '').trim();
  const destination = String(body.destination ?? '').trim();
  const product = String(body.product ?? '').trim();
  const price = body.default_transport_price === '' || body.default_transport_price == null
    ? 0 : Number(body.default_transport_price);

  if (!name || !origin || !destination) {
    return NextResponse.json({ error: 'กรุณากรอกชื่อแม่แบบ ต้นทาง และปลายทาง' }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'ค่าขนส่งเริ่มต้นต้องเป็นตัวเลขไม่ติดลบ' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('recurring_routes')
    .insert({ name, origin, destination, product, default_transport_price: price, created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
