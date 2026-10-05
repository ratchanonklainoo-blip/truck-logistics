import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computePayroll } from '@/lib/payrollServer';
import { payrollChangedFields } from '@/lib/payrollCalc';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, ...rest } = body;

  const { data: payroll } = await supabase.from('payrolls')
    .select('*')
    .eq('id', id).is('deleted_at', null).single();
  if (!payroll) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'approve') {
    if (payroll.status !== 'draft') return NextResponse.json({ error: 'อนุมัติได้เฉพาะใบที่เป็นร่าง' }, { status: 409 });
    // คำนวณใหม่ก่อนอนุมัติ: ถ้าเที่ยว/เบิก/เงินฐานเปลี่ยนหลังคำนวณล่าสุด ให้อัปเดตใบร่างแล้วให้ผู้ใช้ตรวจยอดใหม่ก่อนกดอนุมัติอีกครั้ง
    // (ไม่ล็อกใบด้วยตัวเลขเก่า — เคส เอก พ.ค. ที่เบิก 3,600 ไม่ถูกหัก)
    const fresh = await computePayroll(supabase, payroll.driver_id, payroll.month_year, {
      other_additions: payroll.other_additions, other_deductions: payroll.other_deductions,
    });
    if (!fresh.ok) return NextResponse.json({ error: fresh.error, code: fresh.code }, { status: fresh.status });
    const changed = payrollChangedFields(payroll, fresh.numbers);
    if (changed.length > 0) {
      const { data, error } = await supabase.from('payrolls')
        .update(fresh.numbers).eq('id', id).eq('status', 'draft').select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
      return NextResponse.json({
        error: `ยอดเปลี่ยนจากที่คำนวณไว้ (มีการแก้เที่ยว/เบิก/เงินเดือนหลังคำนวณ) ระบบคำนวณใหม่แล้ว: สุทธิ ${fmt(Number(payroll.net_pay))} → ${fmt(fresh.numbers.net_pay)} บาท กรุณาตรวจยอดแล้วกดอนุมัติอีกครั้ง`,
        code: 'PAYROLL_RECALCULATED', changed, data,
      }, { status: 409 });
    }
    const { data, error } = await supabase.from('payrolls')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'draft').select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'pay') {
    if (payroll.status !== 'approved') return NextResponse.json({ error: 'ต้องอนุมัติก่อนจึงจะบันทึกการจ่ายได้' }, { status: 409 });
    const { data, error } = await supabase.from('payrolls')
      .update({ status: 'paid', paid_by: user.id, paid_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // General edit — แก้ได้เฉพาะรายได้อื่น/รายการหักอื่น/หมายเหตุ ของใบที่ยังเป็น draft
  // (ห้ามส่ง status, net_pay, driver_id ฯลฯ มาแก้ตรงๆ) แล้วคำนวณยอดรวม/สุทธิใหม่ฝั่ง server
  if (payroll.status !== 'draft') {
    return NextResponse.json({ error: 'ใบเงินเดือนที่อนุมัติหรือจ่ายแล้วแก้ไขไม่ได้' }, { status: 409 });
  }

  const updates: Record<string, unknown> = {};
  for (const f of ['other_additions', 'other_deductions'] as const) {
    if (rest[f] === undefined) continue;
    const n = Number(rest[f]);
    if (rest[f] === null || rest[f] === '' || !Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'จำนวนเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' }, { status: 400 });
    }
    updates[f] = Math.round(n * 100) / 100;
  }
  if (rest.notes !== undefined) {
    if (rest.notes !== null && typeof rest.notes !== 'string') {
      return NextResponse.json({ error: 'หมายเหตุต้องเป็นข้อความ' }, { status: 400 });
    }
    updates.notes = rest.notes;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'ไม่มีฟิลด์ที่แก้ไขได้' }, { status: 400 });
  }

  if (updates.other_additions !== undefined || updates.other_deductions !== undefined) {
    const { data: cur, error: curErr } = await supabase.from('payrolls')
      .select('other_additions, other_deductions').eq('id', id).single();
    if (curErr || !cur) return NextResponse.json({ error: curErr?.message || 'Not found' }, { status: 500 });
    const add = Number(updates.other_additions ?? cur.other_additions ?? 0);
    const ded = Number(updates.other_deductions ?? cur.other_deductions ?? 0);
    const gross = Number(payroll.base_salary) + Number(payroll.total_commission) + add;
    updates.gross_pay = Math.round(gross * 100) / 100;
    updates.net_pay = Math.round((gross - Number(payroll.total_advance) - Number(payroll.social_security) - ded) * 100) / 100;
  }

  const { data, error } = await supabase.from('payrolls').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
