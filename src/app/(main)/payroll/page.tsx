'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet, RefreshCw, Calculator, CheckCircle, Banknote,
  ChevronDown, ChevronUp, Printer, RotateCcw, Truck, CreditCard,
  AlertCircle, Info,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Driver {
  id: string;
  name: string;
  nickname: string;
  base_salary: number;
  social_security: number;
}

interface TripRow {
  id: string;
  date: string;
  origin: string;
  destination: string;
  transport_price: number;
  trip_pay: number;
  distance: number;
}

interface AdvanceRow {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
  status: string;
}

interface Payroll {
  id: string;
  driver_id: string;
  month_year: string;
  base_salary: number;
  total_commission: number;
  total_advance: number;
  social_security: number;
  other_deductions: number;
  other_additions: number;
  gross_pay: number;
  net_pay: number;
  trip_count: number;
  total_distance: number;
  status: 'draft' | 'approved' | 'paid';
  approved_at: string | null;
  paid_at: string | null;
  driver?: Driver | null;
  trips?: TripRow[];
  advances?: AdvanceRow[];
}

const THAI_MONTHS = ['', 'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthYear(my: string): string {
  const [y, m] = my.split('-');
  return `${THAI_MONTHS[Number(m)]} ${Number(y) + 543}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

const STATUS_CONFIG = {
  draft:    { label: 'ร่าง',        color: 'text-slate-600', bg: 'bg-slate-100' },
  approved: { label: 'อนุมัติแล้ว', color: 'text-blue-700',  bg: 'bg-blue-100'  },
  paid:     { label: 'จ่ายแล้ว',    color: 'text-green-700', bg: 'bg-green-100' },
};

export default function PayrollPage() {
  const [supabase]      = useState(() => createClient());
  const router          = useRouter();
  const [payrolls,      setPayrolls]      = useState<Payroll[]>([]);
  const [drivers,       setDrivers]       = useState<Driver[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthYear());
  const [generating,    setGenerating]    = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: pay }, { data: dr }] = await Promise.all([
      supabase.from('payrolls').select('*').is('deleted_at', null)
        .eq('month_year', selectedMonth).order('created_at', { ascending: true }),
      supabase.from('drivers').select('id,name,nickname,base_salary,social_security')
        .is('deleted_at', null).eq('is_active', true),
    ]);
    const drList = dr || [];
    setDrivers(drList);
    const drMap: Record<string, Driver> = {};
    drList.forEach(d => { drMap[d.id] = d; });
    const enriched = (pay || []).map(p => ({ ...p, driver: drMap[p.driver_id] || null }));
    setPayrolls(enriched as Payroll[]);
    setLoading(false);
  }, [supabase, selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadDetail = async (payroll: Payroll) => {
    if (payroll.trips !== undefined) return;
    setDetailLoading(payroll.id);
    const [y, m] = payroll.month_year.split('-').map(Number);
    const dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
    const dateTo   = new Date(y, m, 0).toISOString().slice(0, 10);

    const [{ data: trips }, { data: advances }] = await Promise.all([
      supabase.from('trips')
        .select('id,date,origin,destination,transport_price,trip_pay,distance')
        .eq('driver_id', payroll.driver_id)
        .gte('date', dateFrom).lte('date', dateTo)
        .is('deleted_at', null)
        .order('date', { ascending: true }),
      supabase.from('advance_requests')
        .select('id,amount,reason,created_at,status')
        .eq('driver_id', payroll.driver_id)
        .eq('month_year', payroll.month_year)
        .in('status', ['approved', 'paid'])
        .is('deleted_at', null),
    ]);

    setPayrolls(prev => prev.map(p =>
      p.id === payroll.id
        ? { ...p, trips: (trips || []) as TripRow[], advances: (advances || []) as AdvanceRow[] }
        : p
    ));
    setDetailLoading(null);
  };

  const handleToggleExpand = async (p: Payroll) => {
    if (expanded === p.id) {
      setExpanded(null);
    } else {
      setExpanded(p.id);
      await loadDetail(p);
    }
  };

  const generateAll = async () => {
    if (!confirm(`คำนวณเงินเดือนเดือน ${formatMonthYear(selectedMonth)} สำหรับคนขับทั้งหมด?`)) return;
    setGenerating(true);
    try {
      for (const driver of drivers) {
        await fetch('/api/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driver.id, month_year: selectedMonth }),
        });
      }
      await loadData();
    } finally { setGenerating(false); }
  };

  const recalcOne = async (p: Payroll) => {
    setActionLoading(p.id + '-recalc');
    await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: p.driver_id, month_year: selectedMonth }),
    });
    setPayrolls(prev => prev.map(x => x.id === p.id ? { ...x, trips: undefined, advances: undefined } : x));
    await loadData();
    setActionLoading(null);
  };

  const handleApprove = async (p: Payroll) => {
    setActionLoading(p.id + '-approve');
    await supabase.from('payrolls').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', p.id);
    await loadData();
    setActionLoading(null);
  };

  const handlePay = async (p: Payroll) => {
    if (!confirm(`ยืนยันการจ่ายเงินเดือนให้ ${p.driver?.nickname}?`)) return;
    setActionLoading(p.id + '-pay');
    await supabase.from('payrolls').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', p.id);
    await loadData();
    setActionLoading(null);
  };

  // Summary totals
  const totalNetPay  = payrolls.reduce((s, p) => s + p.net_pay, 0);
  const totalTrips   = payrolls.reduce((s, p) => s + p.trip_count, 0);
  const draftCount   = payrolls.filter(p => p.status === 'draft').length;
  const paidCount    = payrolls.filter(p => p.status === 'paid').length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">เงินเดือนและค่ารอบ</h1>
            <p className="text-sm text-slate-500">คำนวณและจ่ายเงินเดือนคนขับ</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" className="form-input text-sm" value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)} />
          <button onClick={loadData} className="btn-secondary text-sm p-2">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push('/payslip')}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> พิมพ์สลิป
          </button>
          <button onClick={generateAll} disabled={generating} className="btn-primary text-sm flex items-center gap-1.5">
            {generating
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Calculator className="w-4 h-4" />}
            คำนวณทั้งหมด
          </button>
        </div>
      </div>

      {/* Month Title */}
      <div className="text-lg font-semibold text-slate-600">{formatMonthYear(selectedMonth)}</div>

      {/* Summary Cards */}
      {payrolls.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-emerald-600 mb-1 font-medium">ยอดจ่ายสุทธิรวม</div>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(totalNetPay)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">คนขับทั้งหมด</div>
            <div className="text-xl font-bold text-slate-800">{payrolls.length} คน</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">เที่ยววิ่งรวม</div>
            <div className="text-xl font-bold text-blue-600">{totalTrips} เที่ยว</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">สถานะ</div>
            <div className="text-sm font-medium text-slate-700">
              {draftCount > 0  && <span className="text-slate-500">ร่าง {draftCount} · </span>}
              {paidCount > 0   && <span className="text-green-600">จ่ายแล้ว {paidCount}</span>}
              {draftCount === 0 && paidCount === 0 && (
                <span className="text-blue-600">อนุมัติแล้ว {payrolls.length}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payroll List */}
      {payrolls.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Calculator className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">ยังไม่มีข้อมูลเงินเดือนเดือนนี้</p>
          <p className="text-sm mt-2 text-slate-400">
            กดปุ่ม &quot;คำนวณทั้งหมด&quot; เพื่อดึงข้อมูลจากเที่ยววิ่งและคำนวณอัตโนมัติ
          </p>
          {drivers.length === 0 && (
            <p className="text-xs mt-3 text-orange-500 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> ยังไม่มีคนขับในระบบ
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {payrolls.map(p => {
            const cfg = STATUS_CONFIG[p.status];
            const isExpanded = expanded === p.id;
            const isDetailLoading = detailLoading === p.id;

            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Row Header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleToggleExpand(p)}
                >
                  {/* Driver info */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">
                        {p.driver?.nickname || p.driver?.name || 'ไม่ระบุ'}
                      </div>
                      <div className="text-xs text-slate-400">{p.trip_count} เที่ยว · {p.total_distance.toLocaleString('th-TH')} กม.</div>
                    </div>
                  </div>

                  {/* Status + net pay */}
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-700">{formatCurrency(p.net_pay)}</div>
                      <div className="text-xs text-slate-400">สุทธิ</div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {isDetailLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="p-5 space-y-5">
                        {/* 3-column breakdown */}
                        <div className="grid grid-cols-3 gap-4">
                          {/* Income column */}
                          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <div className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">รายได้</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-600">เงินเดือนพื้นฐาน</span>
                                <span className="font-medium">{formatCurrency(p.base_salary)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">ค่ารอบ ({p.trip_count} เที่ยว)</span>
                                <span className="font-medium">{formatCurrency(p.total_commission)}</span>
                              </div>
                              {p.other_additions > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-slate-600">รายได้อื่นๆ</span>
                                  <span className="font-medium text-green-600">+{formatCurrency(p.other_additions)}</span>
                                </div>
                              )}
                              <div className="pt-2 border-t border-blue-200 flex justify-between font-semibold text-blue-800">
                                <span>รวมรายได้</span>
                                <span>{formatCurrency(p.gross_pay)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Deductions column */}
                          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                            <div className="text-xs font-semibold text-red-700 mb-3 uppercase tracking-wide">รายการหัก</div>
                            <div className="space-y-2 text-sm">
                              {p.total_advance > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-slate-600">เบิกล่วงหน้า</span>
                                  <span className="font-medium text-red-600">-{formatCurrency(p.total_advance)}</span>
                                </div>
                              )}
                              {p.social_security > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-slate-600">ประกันสังคม</span>
                                  <span className="font-medium text-red-600">-{formatCurrency(p.social_security)}</span>
                                </div>
                              )}
                              {p.other_deductions > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-slate-600">รายการหักอื่นๆ</span>
                                  <span className="font-medium text-red-600">-{formatCurrency(p.other_deductions)}</span>
                                </div>
                              )}
                              {(p.total_advance + p.social_security + p.other_deductions) === 0 && (
                                <div className="text-xs text-slate-400 italic">ไม่มีรายการหัก</div>
                              )}
                              <div className="pt-2 border-t border-red-200 flex justify-between font-semibold text-red-700">
                                <span>รวมหัก</span>
                                <span>-{formatCurrency(p.total_advance + p.social_security + p.other_deductions)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Net summary card */}
                          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-4 text-white">
                            <div className="text-xs font-semibold text-emerald-100 mb-3 uppercase tracking-wide">ยอดสุทธิ</div>
                            <div className="text-3xl font-bold mb-1">{formatCurrency(p.net_pay)}</div>
                            <div className="text-xs text-emerald-200 mb-4">{formatMonthYear(p.month_year)}</div>

                            {/* Action buttons */}
                            <div className="space-y-2" onClick={e => e.stopPropagation()}>
                              {p.status === 'draft' && (
                                <button
                                  onClick={() => handleApprove(p)}
                                  disabled={actionLoading === p.id + '-approve'}
                                  className="w-full flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {actionLoading === p.id + '-approve' ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                                </button>
                              )}
                              {p.status === 'approved' && (
                                <button
                                  onClick={() => handlePay(p)}
                                  disabled={actionLoading === p.id + '-pay'}
                                  className="w-full flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
                                >
                                  <Banknote className="w-3.5 h-3.5" />
                                  {actionLoading === p.id + '-pay' ? 'กำลังบันทึก...' : 'บันทึกการจ่าย'}
                                </button>
                              )}
                              {p.status === 'paid' && p.paid_at && (
                                <div className="text-xs text-emerald-200 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  จ่ายเมื่อ {formatShortDate(p.paid_at)}
                                </div>
                              )}
                              <button
                                onClick={() => recalcOne(p)}
                                disabled={actionLoading === p.id + '-recalc'}
                                className="w-full flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 text-xs py-1.5 rounded-lg transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                คำนวณใหม่
                              </button>
                              <button
                                onClick={() => router.push(`/payslip?driver=${p.driver_id}&month=${p.month_year}`)}
                                className="w-full flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 text-xs py-1.5 rounded-lg transition-colors"
                              >
                                <Printer className="w-3 h-3" />
                                พิมพ์สลิป
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Trip breakdown table */}
                        {p.trips && p.trips.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5" /> เที่ยววิ่ง ({p.trips.length} รายการ)
                            </h4>
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="text-left px-3 py-2 text-slate-500 font-medium">วันที่</th>
                                    <th className="text-left px-3 py-2 text-slate-500 font-medium">เส้นทาง</th>
                                    <th className="text-right px-3 py-2 text-slate-500 font-medium">ค่าขนส่ง</th>
                                    <th className="text-right px-3 py-2 text-slate-500 font-medium">ค่ารอบ (10%)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {p.trips.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 text-slate-600">{formatShortDate(t.date)}</td>
                                      <td className="px-3 py-2 text-slate-700">
                                        {t.origin} → {t.destination}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(t.transport_price)}</td>
                                      <td className="px-3 py-2 text-right font-medium text-blue-700">{formatCurrency(t.trip_pay)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-slate-50">
                                  <tr>
                                    <td colSpan={3} className="px-3 py-2 text-slate-500 font-medium text-right">รวมค่ารอบ</td>
                                    <td className="px-3 py-2 text-right font-bold text-blue-700">{formatCurrency(p.total_commission)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Advances breakdown table */}
                        {p.advances && p.advances.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5" /> เบิกล่วงหน้า ({p.advances.length} รายการ)
                            </h4>
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="text-left px-3 py-2 text-slate-500 font-medium">วันที่</th>
                                    <th className="text-left px-3 py-2 text-slate-500 font-medium">เหตุผล</th>
                                    <th className="text-right px-3 py-2 text-slate-500 font-medium">จำนวน</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {p.advances.map(a => (
                                    <tr key={a.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 text-slate-600">{formatShortDate(a.created_at)}</td>
                                      <td className="px-3 py-2 text-slate-700">{a.reason || 'ไม่ระบุ'}</td>
                                      <td className="px-3 py-2 text-right font-medium text-red-600">-{formatCurrency(a.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-slate-50">
                                  <tr>
                                    <td colSpan={2} className="px-3 py-2 text-slate-500 font-medium text-right">รวมหักเบิก</td>
                                    <td className="px-3 py-2 text-right font-bold text-red-600">-{formatCurrency(p.total_advance)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Info note */}
                        <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>ค่ารอบคำนวณที่ 10% ของค่าขนส่ง ปัดลงทศนิยมสิบ · ยอดสุทธิ = รายได้ - รายการหัก</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
