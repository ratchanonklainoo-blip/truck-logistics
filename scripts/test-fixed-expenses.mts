// รัน: node scripts/test-fixed-expenses.mts   (Node 22.18+ รองรับ .ts โดยตรง ไม่ต้องติดตั้งเพิ่ม)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixedExpenseStatusForMonth as st, isFixedExpenseCounted as counted, fixedExpenseProgress as prog,
  bangkokToday, type FixedExpenseLike,
} from '../src/lib/fixedExpenses.ts';

const base: FixedExpenseLike = { start_date: null, total_installments: null, paid_installments: 0 };
const months = (fe: FixedExpenseLike, from: string, n: number) => {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (counted(fe, ym)) out.push(ym);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
};

// ── ข้อมูลจริง 4 แถว (ณ 2026-10) ─────────────────────────────────────────────
const car: FixedExpenseLike = { start_date: '2024-05-05', total_installments: 72, paid_installments: 29, due_day: 5 };
const ins: FixedExpenseLike = { start_date: '2026-03-03', total_installments: 6, paid_installments: 6 };

test('ข้อมูลจริง: ค่างวด 72 งวดยังนับ ก.ย./ต.ค. 2026 ; ประกัน 6 งวดผ่อนครบไม่นับ', () => {
  for (const ym of ['2026-09', '2026-10']) {
    assert.equal(counted(car, ym), true);
    assert.equal(counted(ins, ym), false);
  }
  assert.equal(st(car, '2026-10').installment_no, 30);
  assert.equal(st(car, '2026-10').remaining, 42);
  assert.deepEqual(months(ins, '2026-01', 12), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  assert.equal(counted(car, '2024-04'), false);
  assert.equal(st(car, '2030-04').installment_no, 72);
  assert.equal(counted(car, '2030-05'), false);
});

test('ค่าเริ่มต้น frequency/ฟิลด์ใหม่ไม่ระบุ = ผลเท่ากับเดิม', () => {
  const withDefaults = { ...car, frequency: 'monthly' as const, pay_month: null, end_date: null, is_active: true };
  for (const ym of ['2024-04', '2024-05', '2026-10', '2030-04', '2030-05'])
    assert.deepEqual(st(withDefaults, ym), st(car, ym));
  assert.equal(counted(base, '2026-10'), true); // ต่อเนื่อง
  assert.equal(counted({ ...base, total_installments: 3, paid_installments: 3 }, '2026-10'), false); // ไม่มี start_date ใช้ paid
});

test('รายปี: นับเฉพาะเดือนที่จ่าย (เดือนของ start_date) ข้ามปี', () => {
  const y: FixedExpenseLike = { ...base, frequency: 'yearly', start_date: '2025-11-20' };
  assert.deepEqual(months(y, '2025-01', 36), ['2025-11', '2026-11', '2027-11']);
});

test('รายปี: pay_month ระบุเอง และเริ่มหลังเดือนจ่ายของปีนั้น → จ่ายครั้งแรกปีถัดไป', () => {
  const y: FixedExpenseLike = { ...base, frequency: 'yearly', pay_month: 3, start_date: '2025-06-01' };
  assert.deepEqual(months(y, '2025-01', 36), ['2026-03', '2027-03']);
  const y2: FixedExpenseLike = { ...base, frequency: 'yearly', pay_month: 6, start_date: '2025-06-15' };
  assert.deepEqual(months(y2, '2025-01', 29), ['2025-06', '2026-06']); // เดือนเดียวกับเดือนเริ่ม นับปีนั้น
});

test('รายปี + จำนวนงวด: จ่ายครบแล้วหยุด และ installment_no/remaining ถูกต้อง', () => {
  const y: FixedExpenseLike = { ...base, frequency: 'yearly', start_date: '2025-04-01', total_installments: 3 };
  assert.deepEqual(months(y, '2025-01', 72), ['2025-04', '2026-04', '2027-04']);
  assert.equal(st(y, '2026-04').installment_no, 2);
  assert.equal(st(y, '2026-04').remaining, 1);
  assert.equal(st(y, '2027-04').remaining, 0);
  assert.equal(st(y, '2026-09').active, false);
  assert.equal(st(y, '2026-09').remaining, 1); // จ่ายแล้ว 2 จาก 3
});

test('รายปีไม่มี start_date: ใช้ pay_month ทุกปี ; ไม่มีทั้งคู่ = นับต่อเนื่องแบบเดิม', () => {
  assert.deepEqual(months({ ...base, frequency: 'yearly', pay_month: 12 }, '2026-01', 25), ['2026-12', '2027-12']);
  assert.equal(counted({ ...base, frequency: 'yearly' }, '2026-07'), true);
});

test('end_date / ปิดรายการ: เดือนเก่ายังนับ เดือนหลังวันสิ้นสุดไม่นับ', () => {
  const closed: FixedExpenseLike = { ...car, is_active: false, end_date: '2026-06-30' };
  assert.equal(counted(closed, '2026-05'), true);
  assert.equal(counted(closed, '2026-06'), true);
  assert.equal(counted(closed, '2026-07'), false);
  assert.equal(counted({ ...car, is_active: false }, '2026-05'), false); // ปิดแบบไม่มี end_date = พฤติกรรมเดิม
  assert.equal(counted({ ...car, is_active: true, end_date: '2026-06-30' }, '2026-08'), false);
});

test('progress: ค่างวดจริง paid/total จากปฏิทิน (ไม่พึ่ง paid_installments)', () => {
  const p = prog(car, '2026-10', '2026-10-04');
  assert.equal(p.paid, 30);
  assert.equal(p.remaining, 42);
  assert.equal(p.finished, false);
  assert.equal(p.last_month, '2030-04');
  assert.equal(p.near_end, false);
});

test('progress: ประกัน 6 งวดผ่อนครบ = ครบแล้ว (paid 6/6) แม้ paid_installments ผิด', () => {
  const p = prog({ ...ins, paid_installments: 0 }, '2026-10', '2026-10-04');
  assert.equal(p.paid, 6); assert.equal(p.remaining, 0); assert.equal(p.finished, true);
  assert.equal(p.near_end, false);
  const mid = prog(ins, '2026-06', '2026-06-01');
  assert.equal(mid.paid, 4); assert.equal(mid.remaining, 2);
  assert.equal(mid.near_end, true); // เหลือ ≤ 2 งวด
  assert.equal(prog(ins, '2026-02', '2026-02-01').paid, 0);
});

test('progress: แจ้งเตือนใกล้ครบ (เหลือ ≤ 2 งวด หรือ ≤ 60 วัน) และไม่แจ้งถ้าปิดรายการ', () => {
  const f: FixedExpenseLike = { start_date: '2026-01-10', total_installments: 15, paid_installments: 0, due_day: 10 };
  const far = prog(f, '2026-10', '2026-10-04'); // เหลือ 5 งวด งวดสุดท้าย 2027-03-10
  assert.equal(far.remaining, 5); assert.equal(far.near_end, false); assert.equal(far.days_to_last, 157);
  assert.equal(prog(f, '2027-01', '2027-01-04').near_end, true);  // เหลือ 2 งวด
  assert.equal(prog(f, '2026-12', '2027-01-20').near_end, true);  // เหลือ 3 งวดแต่เหลือ 49 วัน
  assert.equal(prog({ ...f, is_active: false }, '2027-01', '2027-01-04').near_end, false);
  assert.equal(prog(f, '2027-03', '2027-03-04').near_end, false); // ครบแล้ว
});

test('progress: รายปีข้ามปี', () => {
  const y: FixedExpenseLike = { ...base, frequency: 'yearly', start_date: '2025-11-20', total_installments: 3 };
  assert.equal(prog(y, '2026-10').paid, 1);
  assert.equal(prog(y, '2026-11').paid, 2);
  assert.equal(prog(y, '2027-12').paid, 3);
  assert.equal(prog(y, '2027-12').finished, true);
  assert.equal(prog(y, '2027-12').last_month, '2027-11');
});

test('progress: ปิดรายการพร้อม end_date นับ paid เฉพาะงวดถึงวันสิ้นสุด', () => {
  const p = prog({ ...car, is_active: false, end_date: '2026-06-30' }, '2026-10');
  assert.equal(p.paid, 26); // พ.ค. 2024 → มิ.ย. 2026 = 26 งวด
  assert.equal(p.closed, true);
});

test('bangkokToday ใช้เวลาไทย (UTC+7)', () => {
  assert.equal(bangkokToday(new Date('2026-09-30T18:00:00Z')).date, '2026-10-01');
});
