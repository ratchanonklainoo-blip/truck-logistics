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
    .update({ name, origin, destination, product, default_transport_price: price })
    .eq('id', id).is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'ไม่พบแม่แบบนี้' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // soft delete — เที่ยวที่สร้างไปแล้วเป็นแถว trips อิสระ ไม่ได้อ้างอิงแม่แบบ
  const { data, error } = await supabase
    .from('recurring_routes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'ไม่พบแม่แบบนี้' }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}
