import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// สร้างแถวใน trips จากแม่แบบเที่ยววิ่งประจำ
// body: { date, driver_id, transport_price?, trip_pay }
// trip_pay (ค่าเที่ยว) ผู้ใช้กรอกเอง — UI คำนวณค่าตั้งต้นด้วย calcCommission เหมือน TripForm
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const date = String(body.date ?? '');
  const driverId = String(body.driver_id ?? '');
  const transportPrice = body.transport_price === '' || body.transport_price == null ? 0 : Number(body.transport_price);
  const tripPay = body.trip_pay === '' || body.trip_pay == null ? NaN : Number(body.trip_pay);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + 'T00:00:00').getTime())) {
    return NextResponse.json({ error: 'กรุณาระบุวันที่ให้ถูกต้อง' }, { status: 400 });
  }
  if (!driverId) return NextResponse.json({ error: 'กรุณาเลือกทะเบียนรถ' }, { status: 400 });
  if (!Number.isFinite(tripPay) || tripPay < 0) {
    return NextResponse.json({ error: 'กรุณากรอกค่าเที่ยว (ตัวเลขไม่ติดลบ)' }, { status: 400 });
  }
  if (!Number.isFinite(transportPrice) || transportPrice < 0) {
    return NextResponse.json({ error: 'ค่าขนส่งต้องเป็นตัวเลขไม่ติดลบ' }, { status: 400 });
  }

  const [{ data: route }, { data: driver }] = await Promise.all([
    supabase.from('recurring_routes').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.from('drivers').select('id').eq('id', driverId).is('deleted_at', null).eq('is_active', true).maybeSingle(),
  ]);
  if (!route) return NextResponse.json({ error: 'ไม่พบแม่แบบนี้' }, { status: 404 });
  if (!driver) return NextResponse.json({ error: 'ไม่พบรถ/คนขับที่เลือก' }, { status: 400 });

  const { data, error } = await supabase
    .from('trips')
    .insert({
      date,
      driver_id: driverId,
      origin: route.origin,
      destination: route.destination,
      product: route.product || '',
      transport_price: transportPrice,
      trip_pay: tripPay,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
