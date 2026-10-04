// ค่าใช้จ่ายประจำ: ตัดสินว่ารายการนั้น "มีผล" ในเดือนที่เลือกหรือไม่ (คำนวณจากปฏิทิน ไม่พึ่ง paid_installments)
// - ปิดรายการแบบไม่มีวันสิ้นสุด (is_active=false, end_date ว่าง) → ไม่นับ (พฤติกรรมเดิม)
// - ปิดรายการพร้อม end_date → นับถึงเดือนของ end_date เดือนเก่ากว่านั้นยังนับเหมือนเดิม
// - ยังไม่ถึงเดือนเริ่ม (start_date) → ไม่นับ
// - รายการผ่อน (total_installments + start_date): งวดที่ n อยู่เดือนเริ่ม + (n-1) พ้นงวดสุดท้ายแล้ว → ไม่นับ
// - ไม่มี start_date แต่มี total_installments: ใช้ตัวนับ paid_installments (จ่ายครบ → ไม่นับ)
// - ไม่มี total_installments: นับต่อเนื่อง (หลังเดือนเริ่ม ถ้ามี)
// - รายปี (frequency='yearly'): นับเต็มจำนวนเฉพาะเดือนที่จ่าย (pay_month หรือเดือนของ start_date) งวดที่ n = ปีที่ n

export type FixedExpenseFrequency = 'monthly' | 'yearly';

export interface FixedExpenseLike {
  start_date: string | null;
  total_installments: number | null;
  paid_installments: number | null;
  frequency?: FixedExpenseFrequency | null;
  /** เดือนที่จ่ายของรายการรายปี 1-12 (ว่าง = ใช้เดือนของ start_date) */
  pay_month?: number | null;
  end_date?: string | null;
  is_active?: boolean | null;
  due_day?: number | null;
}

export interface FixedExpenseMonthStatus {
  active: boolean;
  /** งวดที่ตรงกับเดือนนี้ (เฉพาะรายการผ่อนที่มี start_date) */
  installment_no: number | null;
  /** งวดคงเหลือหลังจากเดือนนี้ (null = ไม่ใช่รายการผ่อน) */
  remaining: number | null;
}

// month_year = 'YYYY-MM' ; start_date = 'YYYY-MM-DD'
function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function bangkokToday(now: Date = new Date()): { ym: string; date: string } {
  const d = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return { ym: d.slice(0, 7), date: d };
}

/** เดือนที่จ่ายของรายการรายปี (null = ระบุไม่ได้) */
export function yearlyPayMonth(fe: FixedExpenseLike): number | null {
  if (fe.pay_month && fe.pay_month >= 1 && fe.pay_month <= 12) return fe.pay_month;
  if (fe.start_date) return Number(fe.start_date.slice(5, 7));
  return null;
}

/** index ของเดือนที่จ่ายครั้งแรก (รายปี + มี start_date) = เดือนจ่ายแรกที่ไม่ก่อนเดือนเริ่ม */
function yearlyFirstIdx(fe: FixedExpenseLike): number | null {
  const pm = yearlyPayMonth(fe);
  if (!fe.start_date || pm === null) return null;
  const sy = Number(fe.start_date.slice(0, 4));
  const sm = Number(fe.start_date.slice(5, 7));
  return (pm >= sm ? sy : sy + 1) * 12 + (pm - 1);
}

const INACTIVE: FixedExpenseMonthStatus = { active: false, installment_no: null, remaining: null };

export function fixedExpenseStatusForMonth(fe: FixedExpenseLike, monthYear: string): FixedExpenseMonthStatus {
  const idx = monthIndex(monthYear);
  if (fe.is_active === false && !fe.end_date) return INACTIVE;
  if (fe.end_date && idx > monthIndex(fe.end_date.slice(0, 7))) return INACTIVE;

  const total = fe.total_installments;
  const isInstallment = total !== null && total !== undefined;

  if ((fe.frequency ?? 'monthly') === 'yearly') {
    const pm = yearlyPayMonth(fe);
    if (pm === null) return { active: true, installment_no: null, remaining: null }; // ระบุเดือนไม่ได้ → นับต่อเนื่องแบบเดิม
    const first = yearlyFirstIdx(fe);
    if (first === null) { // ไม่มี start_date: ตรงเดือนจ่ายของทุกปี
      const isPayMonth = idx % 12 === pm - 1;
      if (isInstallment) {
        const remaining = Math.max(0, total - (fe.paid_installments || 0));
        return { active: isPayMonth && remaining > 0, installment_no: null, remaining };
      }
      return { active: isPayMonth, installment_no: null, remaining: null };
    }
    if (idx < first) return INACTIVE;
    const k = Math.floor((idx - first) / 12);
    if (isInstallment && k >= total) return { active: false, installment_no: null, remaining: 0 };
    const remaining = isInstallment ? total - (k + 1) : null;
    if ((idx - first) % 12 !== 0) return { active: false, installment_no: null, remaining };
    return { active: true, installment_no: isInstallment ? k + 1 : null, remaining };
  }

  if (fe.start_date) {
    const offset = idx - monthIndex(fe.start_date.slice(0, 7));
    if (offset < 0) return INACTIVE;
    if (isInstallment) {
      if (offset >= total) return { active: false, installment_no: null, remaining: 0 };
      return { active: true, installment_no: offset + 1, remaining: total - (offset + 1) };
    }
    return { active: true, installment_no: null, remaining: null };
  }

  if (isInstallment) {
    const remaining = Math.max(0, total - (fe.paid_installments || 0));
    return { active: remaining > 0, installment_no: null, remaining };
  }
  return { active: true, installment_no: null, remaining: null };
}

export function isFixedExpenseCounted(fe: FixedExpenseLike, monthYear: string): boolean {
  return fixedExpenseStatusForMonth(fe, monthYear).active;
}

// ── ความคืบหน้ารายการผ่อน (ใช้แสดง paid/total, ป้าย "ครบแล้ว", แจ้งเตือนใกล้ผ่อนครบ) ──────────────────

export interface FixedExpenseProgress {
  frequency: FixedExpenseFrequency;
  isInstallment: boolean;
  /** งวดที่จ่ายแล้วนับถึงเดือน asOf (null = ไม่ใช่รายการผ่อน) */
  paid: number | null;
  total: number | null;
  remaining: number | null;
  /** ผ่อนครบตามปฏิทินแล้ว */
  finished: boolean;
  /** ปิดรายการ (is_active=false) */
  closed: boolean;
  /** เดือนของงวดสุดท้าย 'YYYY-MM' (null = ไม่ใช่รายการผ่อนหรือไม่มี start_date) */
  last_month: string | null;
  /** วันที่งวดสุดท้าย 'YYYY-MM-DD' */
  last_date: string | null;
  days_to_last: number | null;
  /** ใกล้ผ่อนครบ: เหลือ ≤ 2 งวด หรือ ≤ 60 วัน (ยังไม่ครบ/ไม่ปิด) */
  near_end: boolean;
}

export const NEAR_END_INSTALLMENTS = 2;
export const NEAR_END_DAYS = 60;

function ymFromIdx(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate + 'T00:00:00Z') - Date.parse(fromDate + 'T00:00:00Z')) / 86400000);
}

export function fixedExpenseProgress(fe: FixedExpenseLike, asOfYm: string, todayDate?: string): FixedExpenseProgress {
  const frequency: FixedExpenseFrequency = fe.frequency === 'yearly' ? 'yearly' : 'monthly';
  const total = fe.total_installments ?? null;
  const isInstallment = total !== null;
  const closed = fe.is_active === false;
  let asOfIdx = monthIndex(asOfYm);
  if (fe.end_date) asOfIdx = Math.min(asOfIdx, monthIndex(fe.end_date.slice(0, 7)));

  let paid: number | null = null;
  let lastIdx: number | null = null;
  if (isInstallment) {
    if (frequency === 'yearly') {
      const first = yearlyFirstIdx(fe);
      if (first !== null) {
        paid = asOfIdx < first ? 0 : Math.min(total, Math.floor((asOfIdx - first) / 12) + 1);
        lastIdx = first + 12 * (total - 1);
      }
    } else if (fe.start_date) {
      const startIdx = monthIndex(fe.start_date.slice(0, 7));
      paid = Math.max(0, Math.min(total, asOfIdx - startIdx + 1));
      lastIdx = startIdx + total - 1;
    }
    if (paid === null) paid = Math.min(total, fe.paid_installments || 0);
  }

  const remaining = isInstallment ? Math.max(0, total - (paid as number)) : null;
  const finished = isInstallment && remaining === 0;

  let lastDate: string | null = null;
  let daysToLast: number | null = null;
  if (lastIdx !== null) {
    const ym = ymFromIdx(lastIdx);
    const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const day = Math.min(dim, fe.due_day || (fe.start_date ? Number(fe.start_date.slice(8, 10)) : dim));
    lastDate = `${ym}-${String(day).padStart(2, '0')}`;
    if (todayDate) daysToLast = daysBetween(todayDate, lastDate);
  }

  const nearEnd = isInstallment && !finished && !closed && (
    (remaining as number) <= NEAR_END_INSTALLMENTS ||
    (daysToLast !== null && daysToLast >= 0 && daysToLast <= NEAR_END_DAYS)
  );

  return {
    frequency, isInstallment, paid, total, remaining, finished, closed,
    last_month: lastIdx !== null ? ymFromIdx(lastIdx) : null,
    last_date: lastDate, days_to_last: daysToLast, near_end: nearEnd,
  };
}
