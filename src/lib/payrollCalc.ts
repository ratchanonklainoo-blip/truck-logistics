// สูตรเงินเดือน/ค่าเที่ยวกลาง (ฟังก์ชันบริสุทธิ์) — ใช้ร่วมกันโดย /api/payroll, /api/reports/monthly (ผ่าน monthlyReport),
// สลิป, dashboard, หน้าเที่ยววิ่ง และสคริปต์ทดสอบ ห้ามเขียนสูตรเดียวกันซ้ำในหน้าอื่น
import { countRealTrips } from './tripCount';

// ─── ค่าเที่ยว ────────────────────────────────────────────────
// ใช้ trip_pay ที่บันทึกไว้เท่านั้น (0 = ไม่จ่าย) — 10% เป็นแค่ค่าที่ฟอร์มเติมให้ตอนกรอก ไม่คำนวณ 10% ตอนจ่าย
// (DB บังคับ trip_pay NOT NULL; ถ้าเจอค่าว่างจากข้อมูลผิดปกติ นับเป็น 0 เหมือนกันทุกหน้า)
export function tripPayOf(t: { trip_pay?: number | string | null }): number {
  const n = Number(t.trip_pay);
  return t.trip_pay == null || !Number.isFinite(n) ? 0 : n;
}

export function sumTripPay(trips: { trip_pay?: number | string | null }[]): number {
  return trips.reduce((s, t) => s + tripPayOf(t), 0);
}

// ─── เงินเบิก ─────────────────────────────────────────────────
// แหล่งเดียว: trips.withdraw (ไม่ใช้ advance_requests ในการหัก)
export function sumWithdraw(trips: { withdraw?: number | string | null }[]): number {
  return trips.reduce((s, t) => s + (Number(t.withdraw) || 0), 0);
}

// ─── เดือน ────────────────────────────────────────────────────
export function monthBounds(month_year: string): { from: string; to: string } {
  const [y, m] = month_year.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

// ─── สถานะการทำงานของคนขับในเดือน ─────────────────────────────
export interface EmploymentLike {
  base_salary?: number | string | null;
  social_security?: number | string | null;
  start_date?: string | null;   // 'YYYY-MM-DD' ว่าง = ไม่ระบุ (ถือว่าทำงานมาก่อน)
  end_date?: string | null;     // 'YYYY-MM-DD' วันทำงานวันสุดท้าย (ตั้งตอนปิดใช้งาน)
  is_active?: boolean | null;
  deleted_at?: string | null;
}

/** นับในรายงาน/เงินเดือนหรือไม่ — ตัดแบบเดิมทุกกรณี ยกเว้นคนขับที่ปิดใช้งานผ่านปุ่มใหม่ (มี end_date):
 *  - ถูกลบแบบเดิม (deleted_at) → ไม่นับ (คงตัวเลขเดือนที่แก้ไปแล้ว มี.ค.–พ.ค. 2026)
 *  - is_active=false แต่ไม่มี end_date (ข้อมูลเก่า) → ไม่นับ เหมือนสูตรเดิม (ตัวเลขเดือนเก่าไม่เปลี่ยน)
 *  - is_active=false + end_date (ปิดใช้งานแบบใหม่) → นับในเดือนที่ยังทำงาน */
export function isCountedDriver(d: EmploymentLike | null | undefined): boolean {
  if (!d || d.deleted_at) return false;
  if (d.is_active === false && !d.end_date) return false;
  return true;
}

/** ทำงานอยู่ในเดือนนี้หรือไม่: เริ่มงานไม่หลังวันสิ้นเดือน และวันสุดท้ายไม่ก่อนวันที่ 1 ของเดือน */
export function isEmployedInMonth(d: EmploymentLike, month_year: string): boolean {
  if (!isCountedDriver(d)) return false;
  const { from, to } = monthBounds(month_year);
  if (d.start_date && d.start_date > to) return false;
  if (d.end_date && d.end_date < from) return false;
  return true;
}

/** เริ่มงานกลางเดือน: มี start_date และวันที่เริ่ม > วันที่ 1 ของเดือนนั้น */
export function startedMidMonth(d: EmploymentLike, month_year: string): boolean {
  const { from, to } = monthBounds(month_year);
  return !!d.start_date && d.start_date > from && d.start_date <= to;
}

/** เงินเดือนฐาน + ประกันสังคมของเดือน
 *  - เริ่มกลางเดือน → ฐาน 0 และไม่หักประกันสังคมจากฐาน
 *  - ไม่ได้ทำงานในเดือนนั้น (ก่อนเริ่ม/หลังวันสุดท้าย) → 0 ทั้งคู่
 *  - เริ่มวันที่ 1 หรือไม่มี start_date → ฐานเต็มตามเดิม */
export function baseForMonth(d: EmploymentLike, month_year: string): { base_salary: number; social_security: number } {
  if (!isEmployedInMonth(d, month_year) || startedMidMonth(d, month_year)) {
    return { base_salary: 0, social_security: 0 };
  }
  return { base_salary: Number(d.base_salary) || 0, social_security: Number(d.social_security) || 0 };
}

// ─── ใบเงินเดือน ──────────────────────────────────────────────
export interface PayrollTrip {
  origin?: string | null; destination?: string | null;
  trip_pay?: number | string | null; withdraw?: number | string | null; distance?: number | string | null;
}

export interface PayrollNumbers {
  base_salary: number;
  total_commission: number;
  total_advance: number;
  social_security: number;
  other_additions: number;
  other_deductions: number;
  gross_pay: number;
  net_pay: number;
  trip_count: number;
  total_distance: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** สุทธิ = ฐาน + ค่าเที่ยว + รายได้อื่น − เบิก − ประกันสังคม − หักอื่น (เก็บทศนิยม 2 ตำแหน่ง ไม่ปัดลงหลักสิบ ตามสูตรเดิม) */
export function calcPayroll(input: {
  driver: EmploymentLike; month_year: string; trips: PayrollTrip[];
  other_additions?: number | string | null; other_deductions?: number | string | null;
}): PayrollNumbers {
  const { base_salary, social_security } = baseForMonth(input.driver, input.month_year);
  const commission = r2(sumTripPay(input.trips));
  const advance = r2(sumWithdraw(input.trips));
  const add = r2(Number(input.other_additions) || 0);
  const ded = r2(Number(input.other_deductions) || 0);
  const gross = r2(base_salary + commission + add);
  return {
    base_salary,
    total_commission: commission,
    total_advance: advance,
    social_security,
    other_additions: add,
    other_deductions: ded,
    gross_pay: gross,
    net_pay: r2(gross - advance - social_security - ded),
    trip_count: countRealTrips(input.trips),
    total_distance: r2(input.trips.reduce((s, t) => s + (Number(t.distance) || 0), 0)),
  };
}

const MONEY_FIELDS: (keyof PayrollNumbers)[] = [
  'base_salary', 'total_commission', 'total_advance', 'social_security',
  'other_additions', 'other_deductions', 'gross_pay', 'net_pay', 'trip_count', 'total_distance',
];

/** ฟิลด์ที่ต่างกันระหว่างใบที่เก็บไว้กับผลคำนวณใหม่ (ใช้ตอนอนุมัติ) */
export function payrollChangedFields(stored: Partial<Record<keyof PayrollNumbers, unknown>>, fresh: PayrollNumbers): (keyof PayrollNumbers)[] {
  return MONEY_FIELDS.filter(k => Math.abs((Number(stored[k]) || 0) - fresh[k]) > 0.004);
}
