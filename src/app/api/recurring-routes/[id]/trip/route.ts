import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// แปลง error จาก Supabase เป็นข้อความไทย
function thaiDbError(err: { message?: string; code?: string }): string {
  const msg = err.message || '';
  if (err.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'ไม่มีสิทธิ์บันทึก ลองออกจากระบบแล้วเข้าสู่ระบบใหม่';
  if (err.code === '23503') return 'ไม่พบรถ/คนขับที่เลือกแล้ว (อาจถูกลบ) กรุณาเลือกใหม่';
  if (err.code === '23505') return 'มีเที่ยวนี้อยู่แล้ว';
  if (err.code === '23502') return 'ข้อมูลบางช่องที่จำเป็นยังว่างอยู่';
  if (err.code === '23514') return 'ค่าตัวเลขไม่ถูกต้อง (ห้ามติดลบ)';
  if (err.code === '22P02' || err.code === '22003') return 'มีช่องตัวเลขหรือวันที่ที่ค่าไม่ถูกต้อง';
  return `ระบบขัดข้อง (${msg || 'ไม่ทราบสาเหตุ'})`;
}

// สร้างแถวใน trips จากแม่แบบเที่ยววิ่งประจำ
// body: { date, driver_id, transport_price?, trip_pay, confirm_duplicate? }
// ถ้ามีเที่ยวเดียวกันแล้ว (วันเดียวกัน รถ/คนขับเดียวกัน ต้นทาง/ปลายทาง/สินค้าตามแม่แบบ) ตอบ 409 duplicate ให้ UI ถามยืนยันก่อน
// trip_pay (ค่าเที่ยว) ผู้ใช้กรอกเอง — UI คำนวณค่าตั้งต้นด้วย calcCommission เหมือน TripForm
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 });
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

  const [{ data: route, error: routeErr }, { data: driver, error: driverErr }] = await Promise.all([
    supabase.from('recurring_routes').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.from('drivers').select('id').eq('id', driverId).is('deleted_at', null).eq('is_active', true).maybeSingle(),
  ]);
  if (routeErr || driverErr) {
    return NextResponse.json({ error: `โหลดข้อมูลไม่สำเร็จ: ${thaiDbError((routeErr || driverErr)!)}` }, { status: 500 });
  }
  if (!route) return NextResponse.json({ error: 'ไม่พบแม่แบบนี้ (อาจถูกลบไปแล้ว)' }, { status: 404 });
  if (!driver) return NextResponse.json({ error: 'ไม่พบรถ/คนขับที่เลือก (อาจถูกลบหรือปิดใช้งาน)' }, { status: 400 });

  if (body.confirm_duplicate !== true) {
    const { count, error: dupErr } = await supabase
      .from('trips').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).eq('date', date).eq('driver_id', driverId)
      .eq('origin', route.origin).eq('destination', route.destination).eq('product', route.product || '');
    if (dupErr) return NextResponse.json({ error: `ตรวจเที่ยวซ้ำไม่สำเร็จ: ${thaiDbError(dupErr)}` }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: `วันที่ ${date} รถคันนี้มีเที่ยว ${route.origin} → ${route.destination} อยู่แล้ว ${count} เที่ยว`,
        duplicate: true, count,
      }, { status: 409 });
    }
  }

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
  if (error) return NextResponse.json({ error: `เพิ่มเที่ยวไม่สำเร็จ: ${thaiDbError(error)}` }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
