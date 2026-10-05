// ดึงข้อมูลแล้วคำนวณใบเงินเดือนด้วยสูตรกลาง (payrollCalc) — ใช้โดย POST /api/payroll (คำนวณใหม่) และ PATCH approve
import type { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/fetchAll';
import { calcPayroll, isCountedDriver, isEmployedInMonth, monthBounds, type PayrollNumbers, type PayrollTrip } from '@/lib/payrollCalc';

type Supabase = ReturnType<typeof createClient>;

export type FreshPayroll =
  | { ok: true; numbers: PayrollNumbers }
  | { ok: false; status: number; error: string; code?: string };

/** คำนวณยอดใบเงินเดือนจากเที่ยว + ข้อมูลคนขับปัจจุบัน โดยคง other_additions/other_deductions ที่ส่งมา (จากใบเดิม) */
export async function computePayroll(
  supabase: Supabase, driver_id: string, month_year: string,
  keep: { other_additions?: number | string | null; other_deductions?: number | string | null },
): Promise<FreshPayroll> {
  const { data: driver, error: drErr } = await supabase
    .from('drivers').select('id, base_salary, social_security, start_date, end_date, is_active, deleted_at')
    .eq('id', driver_id).maybeSingle();
  if (drErr) return { ok: false, status: 500, error: drErr.message };
  if (!driver) return { ok: false, status: 404, error: 'ไม่พบคนขับ' };
  if (!isCountedDriver(driver)) {
    return { ok: false, status: 409, error: 'คนขับนี้ถูกลบออกจากระบบแล้ว คำนวณเงินเดือนไม่ได้', code: 'DRIVER_DELETED' };
  }
  if (!isEmployedInMonth(driver, month_year)) {
    return { ok: false, status: 409, error: 'คนขับไม่ได้ทำงานในเดือนนี้ (ก่อนวันเริ่มงานหรือหลังวันสิ้นสุด) ไม่สร้างใบเงินเดือน', code: 'NOT_EMPLOYED' };
  }

  const { from, to } = monthBounds(month_year);
  const { data: trips, error: tripErr } = await fetchAllRows<PayrollTrip>((a, b) => supabase
    .from('trips')
    .select('id, origin, destination, trip_pay, distance, withdraw')
    .eq('driver_id', driver_id)
    .gte('date', from).lte('date', to)
    .is('deleted_at', null)
    .order('id').range(a, b));
  if (tripErr) return { ok: false, status: 500, error: tripErr.message };

  return { ok: true, numbers: calcPayroll({ driver, month_year, trips, ...keep }) };
}
