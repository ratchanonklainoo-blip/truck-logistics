import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computePayroll } from '@/lib/payrollServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month_year = searchParams.get('month_year');
  const driver_id = searchParams.get('driver_id');

  let query = supabase
    .from('payrolls').select('*').is('deleted_at', null)
    .order('month_year', { ascending: false });

  if (month_year) query = query.eq('month_year', month_year);
  if (driver_id) query = query.eq('driver_id', driver_id);

  const { data: payrolls, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const driverIds = Array.from(new Set((payrolls || []).map(p => p.driver_id).filter(Boolean)));
  let drMap: Record<string, { id: string; name: string; nickname: string; base_salary: number }> = {};
  if (driverIds.length > 0) {
    const { data: drs } = await supabase.from('drivers').select('id,name,nickname,base_salary').in('id', driverIds);
    (drs || []).forEach(d => { drMap[d.id] = d; });
  }

  const enriched = (payrolls || []).map(p => ({
    ...p,
    driver: drMap[p.driver_id] || null,
  }));

  // preview=1: คำนวณยอดตามสูตรปัจจุบันของแต่ละใบแบบอ่านอย่างเดียว (ไม่เขียน DB) — หน้าเงินเดือนใช้เทียบกับยอดที่บันทึกในเดือนที่ล็อก
  if (searchParams.get('preview') === '1') {
    const withPreview = await Promise.all(enriched.map(async p => {
      const fresh = await computePayroll(supabase, p.driver_id, p.month_year, {
        other_additions: p.other_additions, other_deductions: p.other_deductions,
      });
      return { ...p, preview: fresh.ok ? fresh.numbers : null, preview_error: fresh.ok ? null : fresh.error };
    }));
    return NextResponse.json({ data: withPreview });
  }

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { driver_id, month_year } = body;

  if (!driver_id || !month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
    return NextResponse.json({ error: 'driver_id and month_year required' }, { status: 400 });
  }

  // ห้ามคำนวณทับใบที่อนุมัติ/จ่ายแล้ว (upsert จะรีเซ็ตสถานะกลับเป็น draft และเขียนตัวเลขทับ)
  const { data: existing, error: existingErr } = await supabase
    .from('payrolls').select('status, other_additions, other_deductions')
    .eq('driver_id', driver_id).eq('month_year', month_year).is('deleted_at', null)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({
      error: `ใบเงินเดือนเดือนนี้${existing.status === 'paid' ? 'จ่ายแล้ว' : 'อนุมัติแล้ว'} คำนวณใหม่ไม่ได้`,
      code: 'PAYROLL_LOCKED',
    }, { status: 409 });
  }

  // สูตรกลาง (lib/payrollCalc): ฐาน + ค่าเที่ยว + รายได้อื่น − เบิก(trips.withdraw) − ประกันสังคม − หักอื่น
  // คงรายได้อื่น/รายการหักอื่นของใบเดิมไว้ (เดิมตั้งเป็น 0 ทุกครั้งที่คำนวณใหม่)
  const fresh = await computePayroll(supabase, driver_id, month_year, {
    other_additions: existing?.other_additions, other_deductions: existing?.other_deductions,
  });
  if (!fresh.ok) return NextResponse.json({ error: fresh.error, code: fresh.code }, { status: fresh.status });

  const { data, error } = await supabase
    .from('payrolls')
    .upsert(
      { driver_id, month_year, ...fresh.numbers, status: 'draft' },
      { onConflict: 'driver_id,month_year' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
