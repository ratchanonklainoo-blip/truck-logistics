'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Truck, Fuel, DollarSign, TrendingUp, TrendingDown,
  Plus, Edit2, Trash2, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  FileText, Activity, Printer,
} from 'lucide-react';
import { formatCurrency, formatNumber, adToBE } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverSummary {
  driver_id: string;
  driver_name: string;
  driver_nickname: string;
  truck_license_plate: string;
  base_salary: number;
  social_security: number;
  trip_count: number;
  total_revenue: number;
  total_fuel_cost: number;
  total_fuel_litres: number;
  total_distance: number;
  total_other_cost: number;
  total_withdraw: number;
  total_commission: number;
  gross_driver_cost: number;
  net_profit: number;
  fuel_efficiency: number;
  avg_fuel_price_per_litre: number;
}

interface FixedExpense {
  id: string;
  name: string;
  category: string;
  truck_license_plate: string | null;
  amount: number;
  total_installments: number | null;
  paid_installments: number;
  remaining_installments: number | null;
  start_date: string | null;
  due_day: number | null;
  is_active: boolean;
  notes: string | null;
}

interface MonthlyTotals {
  total_revenue: number;
  total_fuel_cost: number;
  total_other_cost: number;
  total_driver_cost: number;
  net_profit: number;
  trip_count: number;
  total_distance: number;
  total_fuel_litres: number;
  total_fixed_expenses: number;
  net_after_fixed: number;
  avg_fuel_price_per_litre: number;
}

interface MonthlyReport {
  month_year: string;
  driver_summaries: DriverSummary[];
  fixed_expenses: FixedExpense[];
  totals: MonthlyTotals;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];

const CATEGORY_LABELS: Record<string, string> = {
  insurance: 'ประกันภัย',
  installment: 'ค่างวด',
  maintenance: 'ค่าบำรุงรักษา',
  tax: 'ภาษีรถ',
  annual: 'จ่ายรายปี',
  other: 'อื่นๆ',
};

const CATEGORY_COLORS: Record<string, string> = {
  insurance: 'bg-blue-100 text-blue-700',
  installment: 'bg-purple-100 text-purple-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  tax: 'bg-red-100 text-red-700',
  annual: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
};

function getMonthYear(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthYear(my: string): { year: number; month: number } {
  const [y, m] = my.split('-').map(Number);
  return { year: y, month: m };
}

function displayMonthYear(my: string): string {
  const { year, month } = parseMonthYear(my);
  return `${THAI_MONTHS[month - 1]} ${adToBE(year)}`;
}

// ─── Fixed Expense Form ───────────────────────────────────────────────────────

interface FEFormData {
  name: string;
  category: string;
  truck_license_plate: string;
  amount: string;
  total_installments: string;
  paid_installments: string;
  start_date: string;
  due_day: string;
  is_active: boolean;
  notes: string;
}

const EMPTY_FE: FEFormData = {
  name: '', category: 'insurance', truck_license_plate: '', amount: '',
  total_installments: '', paid_installments: '0', start_date: '',
  due_day: '', is_active: true, notes: '',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'summary' | 'fixed'>('summary');
  const [monthYear, setMonthYear] = useState(getMonthYear(0));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fixedList, setFixedList] = useState<FixedExpense[]>([]);
  const [feLoading, setFeLoading] = useState(false);
  const [showFEModal, setShowFEModal] = useState(false);
  const [editingFE, setEditingFE] = useState<FixedExpense | null>(null);
  const [feForm, setFeForm] = useState<FEFormData>(EMPTY_FE);
  const [feSaving, setFeSaving] = useState(false);
  const [feError, setFeError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/monthly?month_year=${monthYear}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReport(json.data);
    } catch (e: any) {
      setError(e.message || 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const loadFixed = useCallback(async () => {
    setFeLoading(true);
    try {
      const res = await fetch('/api/fixed-expenses');
      const json = await res.json();
      if (res.ok) setFixedList(json.data || []);
    } finally {
      setFeLoading(false);
    }
  }, []);

  useEffect(() => { loadFixed(); }, [loadFixed]);

  const shiftMonth = (delta: number) => {
    const { year, month } = parseMonthYear(monthYear);
    const d = new Date(year, month - 1 + delta, 1);
    setMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const openCreate = () => {
    setEditingFE(null);
    setFeForm(EMPTY_FE);
    setFeError('');
    setShowFEModal(true);
  };

  const openEdit = (fe: FixedExpense) => {
    setEditingFE(fe);
    setFeForm({
      name: fe.name,
      category: fe.category,
      truck_license_plate: fe.truck_license_plate || '',
      amount: String(fe.amount),
      total_installments: fe.total_installments !== null ? String(fe.total_installments) : '',
      paid_installments: String(fe.paid_installments),
      start_date: fe.start_date || '',
      due_day: fe.due_day !== null ? String(fe.due_day) : '',
      is_active: fe.is_active,
      notes: fe.notes || '',
    });
    setFeError('');
    setShowFEModal(true);
  };

  const saveFE = async () => {
    if (!feForm.name.trim() || !feForm.amount) {
      setFeError('กรุณาระบุชื่อและจำนวนเงิน');
      return;
    }
    setFeSaving(true);
    setFeError('');
    try {
      const payload = {
        ...(editingFE ? { id: editingFE.id } : {}),
        name: feForm.name.trim(),
        category: feForm.category,
        truck_license_plate: feForm.truck_license_plate.trim() || null,
        amount: parseFloat(feForm.amount),
        total_installments: feForm.total_installments ? parseInt(feForm.total_installments) : null,
        paid_installments: parseInt(feForm.paid_installments || '0'),
        start_date: feForm.start_date || null,
        due_day: feForm.due_day ? parseInt(feForm.due_day) : null,
        is_active: feForm.is_active,
        notes: feForm.notes.trim() || null,
      };
      const res = await fetch('/api/fixed-expenses', {
        method: editingFE ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShowFEModal(false);
      loadFixed();
      loadReport();
    } catch (e: any) {
      setFeError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setFeSaving(false);
    }
  };

  const deleteFE = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    await fetch(`/api/fixed-expenses?id=${id}`, { method: 'DELETE' });
    loadFixed();
    loadReport();
  };

  const markPaid = async (fe: FixedExpense) => {
    const newPaid = fe.paid_installments + 1;
    await fetch('/api/fixed-expenses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fe.id, paid_installments: newPaid }),
    });
    loadFixed();
    loadReport();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายงานรายเดือน</h1>
          <p className="text-sm text-slate-500 mt-0.5">สรุปค่าใช้จ่ายและกำไรต่อรถแต่ละคัน</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReport}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
            รีโหลด
          </button>
          {activeTab === 'summary' && report && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ / PDF
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[
          { key: 'summary', label: 'สรุปรายเดือน', icon: BarChart3 },
          { key: 'fixed',   label: 'ค่าใช้จ่ายประจำ', icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === key
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-6 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 min-w-[180px] text-center">
              {displayMonthYear(monthYear)}
            </div>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {loading && <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>}
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>}

          {!loading && report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <SummaryCard label="รายได้รวม" value={formatCurrency(report.totals.total_revenue)} icon={<DollarSign className="w-5 h-5" />} color="text-green-600" bg="bg-green-50" />
                <SummaryCard label="ค่าน้ำมันรวม" value={formatCurrency(report.totals.total_fuel_cost)} icon={<Fuel className="w-5 h-5" />} color="text-orange-600" bg="bg-orange-50" />
                <SummaryCard label="เฉลี่ยน้ำมัน/ลิตร" value={`฿${formatNumber(report.totals.avg_fuel_price_per_litre, 2)}`} icon={<Fuel className="w-5 h-5" />} color="text-amber-600" bg="bg-amber-50" />
                <SummaryCard label="ค่าคนขับรวม" value={formatCurrency(report.totals.total_driver_cost)} icon={<Truck className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-50" />
                <SummaryCard label="ค่าใช้จ่ายอื่น" value={formatCurrency(report.totals.total_other_cost)} icon={<Activity className="w-5 h-5" />} color="text-slate-600" bg="bg-slate-100" />
                <SummaryCard label="กำไรสุทธิ" value={formatCurrency(report.totals.net_after_fixed)} icon={report.totals.net_after_fixed >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />} color={report.totals.net_after_fixed >= 0 ? 'text-emerald-600' : 'text-red-600'} bg={report.totals.net_after_fixed >= 0 ? 'bg-emerald-50' : 'bg-red-50'} />
              </div>

              {report.totals.total_fixed_expenses > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                  <Activity className="w-4 h-4 flex-shrink-0" />
                  ค่าใช้จ่ายประจำ (บริษัท) {formatCurrency(report.totals.total_fixed_expenses)} ถูกหักออกจากกำไรรวมแล้ว
                </div>
              )}

              {report.driver_summaries.length === 0 ? (
                <div className="text-center py-12 text-slate-400">ไม่มีข้อมูลเที่ยววิ่งในเดือนนี้</div>
              ) : (
                <div className="space-y-4">
                  {report.driver_summaries.map(ds => (
                    <DriverSummaryCard key={ds.driver_id} summary={ds} fixedExpenses={report.fixed_expenses} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'fixed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">ค่าใช้จ่ายที่ต้องจ่ายทุกเดือน — ประกัน, ค่างวด, ภาษี</p>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />
              เพิ่มรายการ
            </button>
          </div>

          {feLoading && <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>}

          {!feLoading && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {fixedList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">ยังไม่มีรายการค่าใช้จ่ายประจำ</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">รายการ</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">หมวด</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">รถ</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">จำนวน/เดือน</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">งวด</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">สถานะ</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fixedList.map(fe => {
                      const isInstallment = fe.total_installments !== null;
                      const remaining = fe.remaining_installments;
                      const done = isInstallment && remaining === 0;
                      return (
                        <tr key={fe.id} className={`hover:bg-slate-50 ${!fe.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{fe.name}</div>
                            {fe.notes && <div className="text-xs text-slate-400 mt-0.5">{fe.notes}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[fe.category] || 'bg-gray-100 text-gray-700'}`}>
                              {CATEGORY_LABELS[fe.category] || fe.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {fe.truck_license_plate || <span className="text-slate-400 text-xs">ทุกคัน</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                            {formatCurrency(fe.amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isInstallment ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className={`text-xs font-semibold ${done ? 'text-green-600' : remaining === 1 ? 'text-orange-600' : 'text-slate-700'}`}>
                                  {done ? 'ชำระครบแล้ว' : `เหลือ ${remaining} งวด`}
                                </div>
                                <div className="text-[11px] text-slate-400">{fe.paid_installments}/{fe.total_installments} งวด</div>
                                <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                                  <div className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (fe.paid_installments / (fe.total_installments || 1)) * 100)}%` }} />
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">ต่อเนื่อง</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${fe.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {fe.is_active ? 'ใช้งาน' : 'ปิด'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {isInstallment && !done && (
                                <button onClick={() => markPaid(fe)} title="บันทึกชำระงวด" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50">
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => openEdit(fe)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteFE(fe.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-600">รวมค่าใช้จ่ายประจำ (รายการที่ใช้งานอยู่)</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">
                        {formatCurrency(fixedList.filter(f => f.is_active).reduce((s, f) => s + f.amount, 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Print-only layout (hidden on screen, visible when printing) ── */}
      {report && (
        <PrintReport report={report} monthLabel={displayMonthYear(monthYear)} />
      )}

      {showFEModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">{editingFE ? 'แก้ไขรายการ' : 'เพิ่มค่าใช้จ่ายประจำ'}</h2>
              <button onClick={() => setShowFEModal(false)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {feError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{feError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อรายการ *</label>
                  <input value={feForm.name} onChange={e => setFeForm(p => ({ ...p, name: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เช่น ประกันชั้น 1 รถ 71-1831" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">หมวดหมู่</label>
                  <select value={feForm.category} onChange={e => setFeForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ทะเบียนรถ (ถ้ามี)</label>
                  <input value={feForm.truck_license_plate} onChange={e => setFeForm(p => ({ ...p, truck_license_plate: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เว้นว่างถ้าเป็นของบริษัท" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนเงิน/เดือน (บาท) *</label>
                  <input type="number" value={feForm.amount} onChange={e => setFeForm(p => ({ ...p, amount: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ครบกำหนดจ่าย</label>
                  <input type="number" min="1" max="31" value={feForm.due_day} onChange={e => setFeForm(p => ({ ...p, due_day: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เช่น 5 (วันที่ 5 ของเดือน)" />
                </div>
                <div className="col-span-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500 mb-3">ข้อมูลผ่อนชำระ (ถ้าเป็นค่างวด)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนงวดทั้งหมด</label>
                      <input type="number" min="1" value={feForm.total_installments} onChange={e => setFeForm(p => ({ ...p, total_installments: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="-" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">ชำระแล้ว (งวด)</label>
                      <input type="number" min="0" value={feForm.paid_installments} onChange={e => setFeForm(p => ({ ...p, paid_installments: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">เริ่มผ่อนวันที่</label>
                      <input type="date" value={feForm.start_date} onChange={e => setFeForm(p => ({ ...p, start_date: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
                  <input value={feForm.notes} onChange={e => setFeForm(p => ({ ...p, notes: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="fe-active" checked={feForm.is_active} onChange={e => setFeForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                  <label htmlFor="fe-active" className="text-sm text-slate-700">ใช้งานอยู่ (นับรวมในรายงาน)</label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowFEModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
              <button onClick={saveFE} disabled={feSaving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {feSaving ? 'กำลังบันทึก...' : editingFE ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Print Report ────────────────────────────────────────────────────────────

const PRINT_CSS = [
  '@media print {',
  '  body * { visibility: hidden; }',
  '  #print-report, #print-report * { visibility: visible; }',
  '  #print-report { position: absolute; inset: 0; padding: 24px 32px; font-family: Sarabun, sans-serif; font-size: 13px; color: #111; }',
  '}',
  '@media screen { #print-report { display: none; } }',
].join('\n');

const thStyle: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12 };
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 12 };

function PrintReport({ report, monthLabel }: { report: MonthlyReport; monthLabel: string }) {
  const { totals, driver_summaries, fixed_expenses } = report;
  const activeFixed = fixed_expenses.filter(fe => fe.is_active);
  const companyFixedTotal = activeFixed.filter(fe => !fe.truck_license_plate).reduce((s, fe) => s + fe.amount, 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div id="print-report">
        <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid #1E3A5F', paddingBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A5F' }}>หจก.ณสิริทรัพย์ การเกษตร</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>รายงานสรุปประจำเดือน {monthLabel}</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <tbody>
            <tr style={{ background: '#f1f5f9' }}>
              <td style={tdStyle}>รายได้รวม</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{formatCurrency(totals.total_revenue)}</td>
              <td style={tdStyle}>จำนวนเที่ยว</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{totals.trip_count} เที่ยว</td>
            </tr>
            <tr>
              <td style={tdStyle}>ค่าน้ำมันรวม</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: '#ea580c' }}>{formatCurrency(totals.total_fuel_cost)}</td>
              <td style={tdStyle}>ระยะทางรวม</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(totals.total_distance)} กม.</td>
            </tr>
            <tr style={{ background: '#f1f5f9' }}>
              <td style={tdStyle}>ค่าคนขับรวม</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: '#2563eb' }}>{formatCurrency(totals.total_driver_cost)}</td>
              <td style={tdStyle}>ค่าใช้จ่ายอื่น</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totals.total_other_cost)}</td>
            </tr>
            <tr>
              <td style={tdStyle}>ค่าใช้จ่ายประจำ (บริษัท)</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>{formatCurrency(companyFixedTotal)}</td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>กำไรสุทธิ</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 14, color: totals.net_after_fixed >= 0 ? '#059669' : '#dc2626' }}>
                {formatCurrency(totals.net_after_fixed)}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#1E3A5F' }}>รายละเอียดแต่ละคัน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#1E3A5F', color: '#fff' }}>
              <th style={thStyle}>คนขับ / รถ</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>เที่ยว</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>รายได้</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>น้ำมัน</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ค่าคนขับ</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>สิ้นเปลือง</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>กำไรสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {driver_summaries.map((ds, i) => {
              const tf = activeFixed.filter(fe => fe.truck_license_plate === ds.truck_license_plate);
              const tfTotal = tf.reduce((s, fe) => s + fe.amount, 0);
              const net = ds.net_profit - tfTotal;
              return (
                <tr key={ds.driver_id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600 }}>{ds.driver_nickname || ds.driver_name}</span>
                    {ds.truck_license_plate && <span style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>({ds.truck_license_plate})</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{ds.trip_count}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#16a34a' }}>{formatCurrency(ds.total_revenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#ea580c' }}>{formatCurrency(ds.total_fuel_cost)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#2563eb' }}>{formatCurrency(ds.gross_driver_cost)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(ds.fuel_efficiency, 2)} กม./ล.</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: net >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {activeFixed.length > 0 && (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#1E3A5F' }}>ค่าใช้จ่ายประจำเดือน</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#1E3A5F', color: '#fff' }}>
                  <th style={thStyle}>รายการ</th>
                  <th style={thStyle}>หมวด</th>
                  <th style={thStyle}>รถ</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>จำนวน/เดือน</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>งวด</th>
                </tr>
              </thead>
              <tbody>
                {activeFixed.map((fe, i) => (
                  <tr key={fe.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={tdStyle}>{fe.name}{fe.notes ? ' — ' + fe.notes : ''}</td>
                    <td style={tdStyle}>{CATEGORY_LABELS[fe.category] || fe.category}</td>
                    <td style={tdStyle}>{fe.truck_license_plate || 'บริษัท'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>{formatCurrency(fe.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fe.total_installments !== null
                        ? fe.paid_installments + '/' + fe.total_installments + ' (เหลือ ' + fe.remaining_installments + ' งวด)'
                        : 'ต่อเนื่อง'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#e2e8f0', fontWeight: 700 }}>
                  <td colSpan={3} style={tdStyle}>รวมค่าใช้จ่ายประจำ</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>
                    {formatCurrency(activeFixed.reduce((s, fe) => s + fe.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 10, borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
          <span>พิมพ์โดย: Truck Logistics OS</span>
          <span>วันที่พิมพ์: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
    </>
  );
}


function SummaryCard({ label, value, icon, color, bg }: { label: string; value: string; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`${bg} ${color} rounded-lg p-2`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 truncate">{label}</p>
          <p className={`text-lg font-bold ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function DriverSummaryCard({ summary: s, fixedExpenses }: { summary: DriverSummary; fixedExpenses: FixedExpense[] }) {
  const [expanded, setExpanded] = useState(false);
  const truckFixed = fixedExpenses.filter(fe => fe.is_active && fe.truck_license_plate === s.truck_license_plate);
  const truckFixedTotal = truckFixed.reduce((sum, fe) => sum + fe.amount, 0);
  const netAfterFixed = s.net_profit - truckFixedTotal;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setExpanded(p => !p)} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 text-left">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Truck className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800">
            {s.driver_nickname || s.driver_name}
            {s.truck_license_plate && <span className="ml-2 text-xs text-slate-400 font-normal">({s.truck_license_plate})</span>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{s.trip_count} เที่ยว · {formatNumber(s.total_distance)} กม.</div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="text-xs text-slate-400">รายได้</div>
            <div className="font-semibold text-green-600">{formatCurrency(s.total_revenue)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">น้ำมัน</div>
            <div className="font-semibold text-orange-600">{formatCurrency(s.total_fuel_cost)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">คนขับ</div>
            <div className="font-semibold text-blue-600">{formatCurrency(s.gross_driver_cost)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">กำไรสุทธิ</div>
            <div className={`font-bold text-base ${netAfterFixed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(netAfterFixed)}</div>
          </div>
        </div>
        <div className="text-slate-300 ml-2">{expanded ? '\u25b2' : '\u25bc'}</div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
            <DetailItem label="รายได้รวม" value={formatCurrency(s.total_revenue)} valueClass="text-green-700" />
            <DetailItem label="ค่าน้ำมัน" value={formatCurrency(s.total_fuel_cost)} valueClass="text-orange-700" />
            <DetailItem label="ค่าใช้จ่ายอื่น" value={formatCurrency(s.total_other_cost)} valueClass="text-slate-700" />
            <DetailItem label="ค่ารอบ" value={formatCurrency(s.total_commission)} valueClass="text-purple-700" />
            <DetailItem label="เงินเดือนพื้นฐาน" value={formatCurrency(s.base_salary)} valueClass="text-slate-700" />
            <DetailItem label="รวมค่าคนขับ" value={formatCurrency(s.gross_driver_cost)} valueClass="text-blue-700" />
            <DetailItem label="อัตราสิ้นเปลือง" value={`${formatNumber(s.fuel_efficiency, 2)} กม./ลิตร`} valueClass="text-teal-700" />
            <DetailItem label="ราคาน้ำมัน/ลิตร" value={`฿${formatNumber(s.avg_fuel_price_per_litre, 2)}`} valueClass="text-amber-700" />
            <DetailItem label="ระยะทางรวม" value={`${formatNumber(s.total_distance)} กม.`} valueClass="text-slate-700" />
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 text-sm space-y-1.5">
            <div className="flex justify-between text-slate-600"><span>รายได้</span><span className="font-medium text-green-700">+{formatCurrency(s.total_revenue)}</span></div>
            <div className="flex justify-between text-slate-600"><span>ค่าน้ำมัน</span><span className="font-medium text-red-600">-{formatCurrency(s.total_fuel_cost)}</span></div>
            <div className="flex justify-between text-slate-600"><span>ค่าใช้จ่ายอื่น</span><span className="font-medium text-red-600">-{formatCurrency(s.total_other_cost)}</span></div>
            <div className="flex justify-between text-slate-600"><span>ค่าคนขับรวม</span><span className="font-medium text-red-600">-{formatCurrency(s.gross_driver_cost)}</span></div>
            {truckFixed.map(fe => (
              <div key={fe.id} className="flex justify-between text-slate-600"><span>{fe.name}</span><span className="font-medium text-red-600">-{formatCurrency(fe.amount)}</span></div>
            ))}
            <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-base">
              <span>กำไรสุทธิ</span>
              <span className={netAfterFixed >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatCurrency(netAfterFixed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-semibold mt-0.5 ${valueClass || 'text-slate-700'}`}>{value}</div>
    </div>
  );
}
0">-{formatCurrency(fe.amount)}</span></div>
            ))}
            <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-base">
              <span>กำไรสุทธิ</span>
              <span className={netAfterFixed >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatCurrency(netAfterFixed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-semibold mt-0.5 ${valueClass || 'text-slate-700'}`}>{value}</div>
    </div>
  );
}
