import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bangkokToday, fixedExpenseProgress } from '@/lib/fixedExpenses';

export const dynamic = 'force-dynamic';

// ตรวจฟิลด์ความถี่/เดือนจ่าย/วันสิ้นสุด — คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน
function validateSchedule(f: { frequency?: unknown; pay_month?: unknown; start_date?: unknown; end_date?: unknown }): string | null {
  if (f.frequency !== undefined && f.frequency !== 'monthly' && f.frequency !== 'yearly') return 'ความถี่ต้องเป็นรายเดือนหรือรายปี';
  const pm = f.pay_month === undefined || f.pay_month === null || f.pay_month === '' ? null : Number(f.pay_month);
  if (pm !== null && (!Number.isInteger(pm) || pm < 1 || pm > 12)) return 'เดือนที่จ่ายต้องอยู่ระหว่าง 1-12';
  if (pm !== null && f.frequency === 'monthly') return 'เดือนที่จ่ายใช้กับรายการรายปีเท่านั้น';
  if (f.frequency === 'yearly' && pm === null && !f.start_date) return 'รายการรายปีต้องระบุเดือนที่จ่าย หรือวันเริ่ม';
  if (f.end_date && f.start_date && String(f.end_date) < String(f.start_date)) return 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
  return null;
}

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

  // งวดที่จ่าย/คงเหลือ คำนวณจากปฏิทิน (เดือนปัจจุบัน) ไม่พึ่ง paid_installments เพียงอย่างเดียว
  const today = bangkokToday();
  const enriched = (data || []).map(fe => {
    const progress = fixedExpenseProgress(fe, today.ym, today.date);
    return { ...fe, progress, remaining_installments: progress.remaining };
  });

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
    due_day, is_active, notes, frequency, pay_month, end_date,
  } = body;

  if (!name || !category || !amount) {
    return NextResponse.json({ error: 'name, category, amount required' }, { status: 400 });
  }

  const scheduleError = validateSchedule({ frequency: frequency ?? 'monthly', pay_month, start_date, end_date });
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 });

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
      frequency: frequency ?? 'monthly',
      pay_month: (frequency ?? 'monthly') === 'yearly' && pay_month ? Number(pay_month) : null,
      end_date: end_date || null,
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

  // ตรวจตารางเวลาจากค่าที่จะเป็นหลังแก้ (รวมค่าเดิมในแถว เมื่อ body ส่งมาไม่ครบ เช่น ปุ่มปิดรายการ)
  const { data: cur } = await supabase.from('fixed_expenses')
    .select('frequency, pay_month, start_date, end_date').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 });
  const next = { ...cur, ...updates };
  if (next.frequency === 'monthly') updates.pay_month = null; // pay_month ใช้กับรายปีเท่านั้น
  const scheduleError = validateSchedule({ ...next, pay_month: updates.pay_month !== undefined ? updates.pay_month : next.pay_month });
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 });
  if (updates.end_date === '') updates.end_date = null;
  if (updates.pay_month === '') updates.pay_month = null;

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
