import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidLat, isValidLng } from '@/lib/utils';

const COORD_FIELDS = ['origin_lat', 'destination_lat', 'origin_lng', 'destination_lng'] as const;

function validateCoords(rest: Record<string, unknown>): string | null {
  for (const field of COORD_FIELDS) {
    const v = rest[field];
    if (v == null) continue;
    const n = Number(v);
    const isLat = field.endsWith('_lat');
    if (isLat ? !isValidLat(n) : !isValidLng(n)) {
      return `${isLat ? 'ละติจูด' : 'ลองจิจูด'}ไม่ถูกต้อง (${field}) ต้องอยู่ระหว่าง ${isLat ? '-90 ถึง 90' : '-180 ถึง 180'}`;
    }
  }
  return null;
}

export const dynamic = 'force-dynamic';

// ฟิลด์ที่ฟอร์มแก้ไขงานแก้ได้ — ไม่รับ deleted_at, job_number, closed_by/closed_at, status, created_by ฯลฯ จาก body
const EDITABLE_FIELDS = [
  'date', 'customer_id', 'origin', 'destination', 'product', 'weight_kg', 'selling_price',
  'source', 'payment_type', 'payment_due_date', 'profit', 'notes',
  'origin_lat', 'origin_lng', 'destination_lat', 'destination_lng',
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  new:             ['waiting_driver', 'assigned'], // จัดรถให้คนขับได้ทันทีโดยไม่ต้องผ่าน 'รอจัดรถ'
  waiting_driver:  ['assigned'],
  assigned:        ['driver_accepted', 'waiting_driver'],
  driver_accepted: ['in_progress'],
  in_progress:     ['delivered'],
  delivered:       ['waiting_payment'],
  waiting_payment: ['closed'],
  closed:          [],
};

const STATUS_TH: Record<string, string> = {
  new: 'งานใหม่', waiting_driver: 'รอจัดรถ', assigned: 'จัดรถแล้ว', driver_accepted: 'คนขับรับงาน',
  in_progress: 'กำลังวิ่ง', delivered: 'ส่งงานแล้ว', waiting_payment: 'รอรับเงิน', closed: 'ปิดงาน',
};

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

  const { data: job, error } = await supabase
    .from('jobs').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error || !job) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 });

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
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

  const body = await req.json();
  const { action, status: newStatus, assigned_driver_id, notes, profit, ...rest } = body;

  const { data: job, error: fetchErr } = await supabase
    .from('jobs').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (fetchErr || !job) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 });

  // Status transition
  if (newStatus) {
    const allowed = VALID_TRANSITIONS[job.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `เปลี่ยนสถานะงานจาก "${STATUS_TH[job.status] || job.status}" เป็น "${STATUS_TH[newStatus] || newStatus}" ไม่ได้`,
        allowed,
      }, { status: 409 });
    }
    if (newStatus === 'assigned' && !assigned_driver_id && !job.assigned_driver_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคนขับก่อนจัดรถ' }, { status: 400 });
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
      .from('jobs').update(update).eq('id', id).is('deleted_at', null).select().maybeSingle();
    if (error) return NextResponse.json({ error: `เปลี่ยนสถานะงานไม่สำเร็จ: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'ไม่พบงานนี้ (อาจถูกลบไปแล้ว)' }, { status: 404 });
    return NextResponse.json({ data });
  }

  // General update (edit fields)
  const coordErr = validateCoords(rest);
  if (coordErr) return NextResponse.json({ error: coordErr }, { status: 400 });

  const fields: Record<string, unknown> = {};
  const src: Record<string, unknown> = { ...rest, notes, profit };
  for (const k of EDITABLE_FIELDS) if (src[k] !== undefined) fields[k] = src[k];
  // ฟอร์มแก้ไขงานส่ง assigned_driver_id มาด้วย — เดิมถูกตัดทิ้งเงียบๆ จึงเปลี่ยนคนขับจากหน้าแก้ไขไม่ได้
  if (assigned_driver_id !== undefined) fields.assigned_driver_id = assigned_driver_id || null;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อมูลที่แก้ไขได้' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('jobs').update(fields).eq('id', id).is('deleted_at', null).select().maybeSingle();
  if (error) return NextResponse.json({ error: `บันทึกงานไม่สำเร็จ: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'ไม่พบงานนี้ (อาจถูกลบไปแล้ว)' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

  const { data, error } = await supabase
    .from('jobs').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: `ลบงานไม่สำเร็จ: ${error.message}` }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'ไม่พบงานนี้ (อาจถูกลบไปแล้ว)' }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}
