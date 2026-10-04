// ค่าใช้จ่ายประจำ: ตัดสินว่ารายการนั้น "มีผล" ในเดือนที่เลือกหรือไม่
// - ยังไม่ถึงเดือนเริ่ม (start_date) → ไม่นับ
// - รายการผ่อน (total_installments + start_date): งวดที่ n อยู่เดือนเริ่ม + (n-1) พ้นงวดสุดท้ายแล้ว → ไม่นับ
// - ไม่มี start_date แต่มี total_installments: ใช้ตัวนับ paid_installments (จ่ายครบ → ไม่นับ)
// - ไม่มี total_installments: นับต่อเนื่อง (หลังเดือนเริ่ม ถ้ามี)

export interface FixedExpenseLike {
  start_date: string | null;
  total_installments: number | null;
  paid_installments: number | null;
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

export function fixedExpenseStatusForMonth(fe: FixedExpenseLike, monthYear: string): FixedExpenseMonthStatus {
  const total = fe.total_installments;
  const isInstallment = total !== null && total !== undefined;

  if (fe.start_date) {
    const offset = monthIndex(monthYear) - monthIndex(fe.start_date.slice(0, 7));
    if (offset < 0) return { active: false, installment_no: null, remaining: null };
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
