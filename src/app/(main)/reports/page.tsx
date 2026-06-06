'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronLeft, ChevronRight, RefreshCw, Printer, Plus,
  Edit2, Trash2, Check, X, FileText, BarChart3,
} from 'lucide-react';
import { formatCurrency, formatNumber, adToBE } from '@/lib/utils';


// Helper for PDF: "1,234 บาท" format (no ฿ symbol)
function fmtB(num: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num) + ' บาท';
}

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
  truck_fixed_cost: number;
  net_profit_after_fixed: number;
  total_extra_expenses: number;
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
  total_extra_expenses: number;
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
  insurance: 'ประกันภัย', installment: 'ค่างวด',
  maintenance: 'ค่าบำรุงรักษา', tax: 'ภาษีรถ',
  annual: 'จ่ายรายปี', other: 'อื่นๆ',
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

interface FEFormData {
  name: string; category: string; truck_license_plate: string;
  amount: string; total_installments: string; paid_installments: string;
  start_date: string; due_day: string; is_active: boolean; notes: string;
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
  const [driverPlates, setDriverPlates] = useState<{ id: string; nickname: string; license_plate: string }[]>([]);

  const loadReport = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/reports/monthly?month_year=${monthYear}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReport(json.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ';
      setError(msg);
    }
    finally { setLoading(false); }
  }, [monthYear]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const loadFixed = useCallback(async () => {
    setFeLoading(true);
    try {
      const res = await fetch('/api/fixed-expenses');
      const json = await res.json();
      if (res.ok) setFixedList(json.data || []);
    } finally { setFeLoading(false); }
  }, []);

  useEffect(() => { loadFixed(); }, [loadFixed]);

  // Load driver license plates for dropdown
  const supabaseRef = useRef(createClient());
  useEffect(() => {
    supabaseRef.current
      .from('drivers')
      .select('id, name, nickname, license_plate')
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ data }) => {
        setDriverPlates(
          (data || [])
            .filter(d => d.license_plate)
            .map(d => ({ id: d.id, nickname: d.nickname || d.name, license_plate: d.license_plate }))
        );
      });
  }, []);

  const shiftMonth = (delta: number) => {
    const { year, month } = parseMonthYear(monthYear);
    const d = new Date(year, month - 1 + delta, 1);
    setMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const openCreate = () => { setEditingFE(null); setFeForm(EMPTY_FE); setFeError(''); setShowFEModal(true); };
  const openEdit = (fe: FixedExpense) => {
    setEditingFE(fe);
    setFeForm({
      name: fe.name, category: fe.category,
      truck_license_plate: fe.truck_license_plate || '',
      amount: String(fe.amount),
      total_installments: fe.total_installments !== null ? String(fe.total_installments) : '',
      paid_installments: String(fe.paid_installments),
      start_date: fe.start_date || '',
      due_day: fe.due_day !== null ? String(fe.due_day) : '',
      is_active: fe.is_active, notes: fe.notes || '',
    });
    setFeError(''); setShowFEModal(true);
  };

  const saveFE = async () => {
    if (!feForm.name.trim() || !feForm.amount) { setFeError('กรุณาระบุชื่อและจำนวนเงิน'); return; }
    setFeSaving(true); setFeError('');
    try {
      const payload = {
        ...(editingFE ? { id: editingFE.id } : {}),
        name: feForm.name.trim(), category: feForm.category,
        truck_license_plate: feForm.truck_license_plate.trim() || null,
        amount: parseFloat(feForm.amount),
        total_installments: feForm.total_installments ? parseInt(feForm.total_installments) : null,
        paid_installments: parseInt(feForm.paid_installments || '0'),
        start_date: feForm.start_date || null,
        due_day: feForm.due_day ? parseInt(feForm.due_day) : null,
        is_active: feForm.is_active, notes: feForm.notes.trim() || null,
      };
      const res = await fetch('/api/fixed-expenses', {
        method: editingFE ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShowFEModal(false); loadFixed(); loadReport();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ';
      setFeError(msg);
    }
    finally { setFeSaving(false); }
  };

  const deleteFE = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    await fetch(`/api/fixed-expenses?id=${id}`, { method: 'DELETE' });
    loadFixed(); loadReport();
  };

  const markPaid = async (fe: FixedExpense) => {
    await fetch('/api/fixed-expenses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fe.id, paid_installments: fe.paid_installments + 1 }),
    });
    loadFixed(); loadReport();
  };

  const totalAllFixed = (report?.fixed_expenses || [])
    .filter(fe => fe.is_active)
    .reduce((s, fe) => s + fe.amount, 0);

  const printDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const exportPDF = async () => {
    const el = document.getElementById('print-area');
    if (!el) return;
    // Temporarily show the print area
    el.style.display = 'block';
    el.style.visibility = 'visible';
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: [6, 8, 6, 8],
          filename: `รายงาน-${displayMonthYear(monthYear)}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        })
        .from(el)
        .save();
    } finally {
      el.style.display = '';
      el.style.visibility = '';
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* ── Print CSS ── */}
      <style dangerouslySetInnerHTML={{ __html: `
@media screen { #print-area { display: none; } }

/* ── Page shell ── */
#print-area {
  font-family: Sarabun, sans-serif;
  font-size: 10px;
  color: #1e293b;
  line-height: 1.4;
  width: 277mm;
  min-height: 190mm;
  padding: 7mm 10mm 6mm;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4mm;
}

/* ── Header ── */
#print-area .pa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #1E3A5F;
  padding-bottom: 3mm;
}
#print-area .pa-header-left { display: flex; align-items: center; gap: 3mm; }
#print-area .pa-logo-box {
  width: 10mm; height: 10mm;
  background: #1E3A5F; border-radius: 2mm;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 900;
}
#print-area .pa-title { font-size: 15px; font-weight: 800; color: #1E3A5F; line-height: 1.1; }
#print-area .pa-subtitle { font-size: 10px; color: #475569; margin-top: 0.5mm; }
#print-area .pa-header-right { text-align: right; }
#print-area .pa-month { font-size: 13px; font-weight: 700; color: #1E3A5F; }
#print-area .pa-print-date { font-size: 8px; color: #475569; margin-top: 0.5mm; }

/* ── Section label ── */
#print-area .pa-section-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
  color: #fff; background: #1E3A5F;
  padding: 1.5mm 3mm; margin-bottom: 1.5mm;
  text-transform: uppercase;
}

/* ── Driver table ── */
#print-area .driver-table { width: 100%; border-collapse: collapse; }
#print-area .driver-table th {
  background: #1e293b; color: #fff;
  padding: 2mm 2.5mm; font-size: 9px; font-weight: 700;
  text-align: right; white-space: nowrap;
}
#print-area .driver-table th:first-child { text-align: left; }
#print-area .driver-table td {
  padding: 2.2mm 2.5mm; font-size: 10px;
  border-bottom: 0.3mm solid #e2e8f0;
  text-align: right; vertical-align: middle;
}
#print-area .driver-table td:first-child { text-align: left; }
#print-area .driver-table tbody tr:nth-child(odd) td { background: #f8fafc; }
#print-area .driver-table tbody tr:nth-child(even) td { background: #fff; }
#print-area .driver-table .row-total td {
  background: #1E3A5F !important; color: #fff;
  font-weight: 700; font-size: 10px; padding: 2.5mm 2.5mm;
}
#print-area .driver-name { font-size: 11px; font-weight: 700; color: #0f172a; }
#print-area .driver-plate { font-size: 8.5px; color: #475569; margin-top: 0.3mm; }

/* ── Bottom 2-col ── */
#print-area .pa-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5mm;
  flex: 1;
}

/* ── Fixed expense table ── */
#print-area .fixed-table { width: 100%; border-collapse: collapse; }
#print-area .fixed-table th {
  background: #334155; color: #fff;
  padding: 1.8mm 2.5mm; font-size: 9px; font-weight: 600;
  text-align: right;
}
#print-area .fixed-table th:first-child { text-align: left; }
#print-area .fixed-table td {
  padding: 2mm 2.5mm; font-size: 10px;
  border-bottom: 0.3mm solid #e2e8f0; text-align: right;
}
#print-area .fixed-table td:first-child { text-align: left; }
#print-area .fixed-table tbody tr:nth-child(odd) td { background: #f8fafc; }
#print-area .fixed-table .row-total td {
  background: #7c3aed !important; color: #fff;
  font-weight: 700; font-size: 10px;
}

/* ── P&L box ── */
#print-area .pl-box {
  border: 0.4mm solid #e2e8f0;
  border-radius: 1.5mm;
  padding: 3mm 4mm;
}
#print-area .pl-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.2mm 0; font-size: 10px;
  border-bottom: 0.2mm solid #f1f5f9;
}
#print-area .pl-row:last-child { border-bottom: none; }
#print-area .pl-label { color: #475569; }
#print-area .pl-value { font-weight: 600; }
#print-area .pl-total {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 2mm; padding-top: 2mm;
  border-top: 0.8mm solid #1E3A5F;
}
#print-area .pl-total-label { font-size: 13px; font-weight: 800; color: #0f172a; }
#print-area .pl-total-value { font-size: 18px; font-weight: 900; }
#print-area .pl-margin { text-align: right; font-size: 9px; margin-top: 1mm; color: #334155; }

/* ── Stat chips ── */
#print-area .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-top: 3mm; }
#print-area .stat-chip { background: #f8fafc; border: 0.3mm solid #e2e8f0; border-radius: 1.5mm; padding: 2mm 3mm; }
#print-area .stat-chip-label { font-size: 8px; color: #334155; }
#print-area .stat-chip-value { font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 0.5mm; }

/* ── Footer ── */
#print-area .pa-footer {
  display: flex; justify-content: space-between;
  padding-top: 2mm; border-top: 0.3mm solid #cbd5e1;
  font-size: 8px; color: #475569;
  margin-top: auto;
}

/* ── Color utils ── */
#print-area .c-green  { color: #059669; }
#print-area .c-red    { color: #dc2626; }
#print-area .c-orange { color: #d97706; }
#print-area .c-blue   { color: #2563eb; }
#print-area .c-purple { color: #7c3aed; }
#print-area .c-teal   { color: #0d9488; }
#print-area .c-gray   { color: #334155; }
`}} />

      {/* PRINT AREA */}
      {report !== null && (
        <div id="print-area">

          {/* ── Header ── */}
          <div className="pa-header">
            <div className="pa-header-left">
              <div className="pa-logo-box">ณ</div>
              <div>
                <div className="pa-title">หจก.ณสิริทรัพย์ การเกษตร</div>
                <div className="pa-subtitle">61 หมู่ 2 ต.ท่าข้าวเหลือก อ.แม่จัน จ.เชียงราย</div>
              </div>
            </div>
            <div className="pa-header-right">
              <div className="pa-month">รายงานประจำเดือน {displayMonthYear(monthYear)}</div>
              <div className="pa-print-date">พิมพ์วันที่ {printDate}</div>
            </div>
          </div>

          {/* ── Driver Summary Table ── */}
          <div>
            <div className="pa-section-label">สรุปผลการดำเนินงานแต่ละคัน</div>
            <table className="driver-table">
              <thead>
                <tr>
                  <th style={{textAlign:'left',width:'16%'}}>คนขับ / รถ</th>
                  <th style={{width:'6%'}}>เที่ยว</th>
                  <th style={{width:'11%'}}>รายได้ (฿)</th>
                  <th style={{width:'13%'}}>น้ำมัน (฿)</th>
                  <th style={{width:'12%'}}>ค่าคนขับ (฿)</th>
                  <th style={{width:'10%'}}>ค่าอื่น (฿)</th>
                  <th style={{width:'12%'}}>ค่าประจำ (฿)</th>
                  <th style={{width:'13%'}}>กำไรสุทธิ (฿)</th>
                  <th style={{width:'7%'}}>กม./ล.</th>
                </tr>
              </thead>
              <tbody>
                {report.driver_summaries.map((ds) => (
                  <tr key={ds.driver_id}>
                    <td>
                      <div className="driver-name">{ds.driver_nickname || ds.driver_name}</div>
                      {ds.truck_license_plate && <div className="driver-plate">{ds.truck_license_plate}</div>}
                    </td>
                    <td style={{textAlign:'center',fontWeight:600}}>{ds.trip_count}</td>
                    <td style={{fontWeight:600}}>{fmtB(ds.total_revenue)}</td>
                    <td className="c-orange">
                      <div>{fmtB(ds.total_fuel_cost)}</div>
                      {ds.avg_fuel_price_per_litre > 0 && (
                        <div style={{fontSize:'8.5px',color:'#b45309'}}>{formatNumber(ds.avg_fuel_price_per_litre,1)} บาท/ล.</div>
                      )}
                    </td>
                    <td className="c-blue">{fmtB(ds.gross_driver_cost)}</td>
                    <td className="c-gray">{ds.total_other_cost > 0 ? fmtB(ds.total_other_cost) : <span style={{color:'#cbd5e1'}}>-</span>}</td>
                    <td className="c-purple">{ds.truck_fixed_cost > 0 ? fmtB(ds.truck_fixed_cost) : <span style={{color:'#cbd5e1'}}>-</span>}</td>
                    <td>
                      <span style={{fontWeight:800,fontSize:'11px'}} className={ds.net_profit_after_fixed >= 0 ? 'c-green' : 'c-red'}>
                        {fmtB(ds.net_profit_after_fixed)}
                      </span>
                    </td>
                    <td className="c-teal" style={{fontWeight:600}}>{ds.fuel_efficiency > 0 ? formatNumber(ds.fuel_efficiency,1) : <span style={{color:'#cbd5e1'}}>-</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="row-total">
                  <td>รวมทุกคัน</td>
                  <td style={{textAlign:'center'}}>{report.totals.trip_count}</td>
                  <td>{fmtB(report.totals.total_revenue)}</td>
                  <td>{fmtB(report.totals.total_fuel_cost)}</td>
                  <td>{fmtB(report.totals.total_driver_cost)}</td>
                  <td>{fmtB(report.totals.total_other_cost)}</td>
                  <td>{fmtB(totalAllFixed)}</td>
                  <td style={{fontSize:'12px',fontWeight:900}}>{fmtB(report.totals.net_after_fixed)}</td>
                  <td>{report.totals.avg_fuel_price_per_litre > 0 ? `${formatNumber(report.totals.avg_fuel_price_per_litre,1)}` : '-'}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Bottom: Fixed + P&L side by side ── */}
          <div className="pa-bottom">

            {/* Fixed Expenses */}
            <div>
              <div className="pa-section-label">ค่าใช้จ่ายประจำเดือน</div>
              <table className="fixed-table">
                <thead>
                  <tr>
                    <th style={{textAlign:'left'}}>รายการ</th>
                    <th>รถ</th>
                    <th>จำนวน (฿)</th>
                    <th>งวดคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.fixed_expenses.filter(fe => fe.is_active).map((fe) => {
                    const isInst = fe.total_installments !== null;
                    const done = isInst && fe.remaining_installments === 0;
                    return (
                      <tr key={fe.id}>
                        <td style={{fontWeight:600}}>{fe.name}</td>
                        <td style={{fontSize:'9px',color:'#334155',textAlign:'center'}}>{fe.truck_license_plate || 'บริษัท'}</td>
                        <td style={{fontWeight:600}}>{fmtB(fe.amount)}</td>
                        <td style={{textAlign:'center',fontSize:'9px'}}>
                          {isInst ? (done ? <span style={{color:'#059669'}}>ครบแล้ว</span> : `เหลือ ${fe.remaining_installments}`) : <span style={{color:'#475569'}}>ต่อเนื่อง</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="row-total">
                    <td colSpan={2}>รวมค่าใช้จ่ายประจำทั้งหมด</td>
                    <td>{fmtB(totalAllFixed)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* P&L + Stats */}
            <div style={{display:'flex',flexDirection:'column',gap:'3mm'}}>
              <div>
                <div className="pa-section-label">สรุปผลประกอบการ</div>
                <div className="pl-box">
                  <div className="pl-row">
                    <span className="pl-label">รายได้รวมทั้งหมด</span>
                    <span className="pl-value c-green" style={{fontSize:'12px'}}>{fmtB(report.totals.total_revenue)}</span>
                  </div>
                  <div className="pl-row">
                    <span className="pl-label">หัก ค่าน้ำมัน</span>
                    <span className="pl-value c-orange">- {fmtB(report.totals.total_fuel_cost)}</span>
                  </div>
                  <div className="pl-row">
                    <span className="pl-label">หัก ค่าคนขับ (รอบ + เงินเดือน)</span>
                    <span className="pl-value c-blue">- {fmtB(report.totals.total_driver_cost)}</span>
                  </div>
                  <div className="pl-row">
                    <span className="pl-label">หัก ค่าใช้จ่ายอื่นๆ (เที่ยว)</span>
                    <span className="pl-value c-gray">- {fmtB(report.totals.total_other_cost)}</span>
                  </div>
                  {(report.totals.total_extra_expenses || 0) > 0 && (
                  <div className="pl-row">
                    <span className="pl-label">หัก ค่าใช้จ่ายเพิ่มเติม</span>
                    <span className="pl-value c-gray">- {fmtB(report.totals.total_extra_expenses || 0)}</span>
                  </div>
                  )}
                  <div className="pl-row">
                    <span className="pl-label">หัก ค่าใช้จ่ายประจำ</span>
                    <span className="pl-value c-purple">- {fmtB(totalAllFixed)}</span>
                  </div>
                  <div className="pl-total">
                    <span className="pl-total-label">กำไรสุทธิ</span>
                    <span className={`pl-total-value ${report.totals.net_after_fixed >= 0 ? 'c-green' : 'c-red'}`}>
                      {fmtB(report.totals.net_after_fixed)}
                    </span>
                  </div>
                  {report.totals.total_revenue > 0 && (
                    <div className="pl-margin">
                      Margin {(report.totals.net_after_fixed / report.totals.total_revenue * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-chip">
                  <div className="stat-chip-label">เฉลี่ยน้ำมัน / ลิตร</div>
                  <div className="stat-chip-value">฿{formatNumber(report.totals.avg_fuel_price_per_litre,2)}</div>
                </div>
                <div className="stat-chip">
                  <div className="stat-chip-label">รวมระยะทาง</div>
                  <div className="stat-chip-value">{formatNumber(report.totals.total_distance)} กม.</div>
                </div>
                <div className="stat-chip">
                  <div className="stat-chip-label">น้ำมันทั้งหมด</div>
                  <div className="stat-chip-value">{formatNumber(report.totals.total_fuel_litres,0)} ลิตร</div>
                </div>
                <div className="stat-chip">
                  <div className="stat-chip-label">จำนวนเที่ยว</div>
                  <div className="stat-chip-value">{report.totals.trip_count} เที่ยว</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="pa-footer">
            <span>หจก.ณสิริทรัพย์ การเกษตร — ระบบ Truck Logistics OS</span>
            <span>เอกสารนี้ออกโดยระบบอัตโนมัติ ไม่ต้องลงลายมือชื่อ</span>
          </div>

        </div>
      )}

      {/* ── Screen Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายงานรายเดือน</h1>
          <p className="text-sm text-slate-500 mt-0.5">สรุปรายได้ ค่าใช้จ่าย และกำไรสุทธิ</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadReport} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" />รีโหลด
          </button>
          {activeTab === 'summary' && report && (
            <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#163050]">
              <Printer className="w-4 h-4" />โหลด PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[{ key: 'summary', label: 'สรุปรายเดือน', icon: BarChart3 }, { key: 'fixed', label: 'ค่าใช้จ่ายประจำ', icon: FileText }].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as 'summary' | 'fixed')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: Monthly Summary
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Month nav */}
          <div className="flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-8 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 min-w-[200px] text-center text-lg">
              {displayMonthYear(monthYear)}
            </div>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>

          {loading && <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>}
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700">{error}</div>}

          {!loading && report && (
            <div className="space-y-6">
              {/* ── Summary Cards ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <SummaryCard label="รายได้รวม" value={formatCurrency(report.totals.total_revenue)} icon="💰" color="text-green-700" bg="bg-green-50" />
                <SummaryCard label="ค่าน้ำมัน" value={formatCurrency(report.totals.total_fuel_cost)} icon="⛽" color="text-orange-700" bg="bg-orange-50" />
                <SummaryCard label="เฉลี่ย/ลิตร" value={`฿${formatNumber(report.totals.avg_fuel_price_per_litre, 2)}`} icon="📊" color="text-amber-700" bg="bg-amber-50" />
                <SummaryCard label="ค่าคนขับ" value={formatCurrency(report.totals.total_driver_cost)} icon="👤" color="text-blue-700" bg="bg-blue-50" />
                <SummaryCard label="ค่าใช้จ่ายอื่น" value={formatCurrency(report.totals.total_other_cost)} icon="📋" color="text-slate-700" bg="bg-slate-50" />
                <SummaryCard
                  label="กำไรสุทธิ"
                  value={formatCurrency(report.totals.net_after_fixed)}
                  icon={report.totals.net_after_fixed >= 0 ? '✅' : '❌'}
                  color={report.totals.net_after_fixed >= 0 ? 'text-emerald-700' : 'text-red-700'}
                  bg={report.totals.net_after_fixed >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
                />
              </div>

              {/* ── Main CEO Table ── */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <span className="font-semibold text-slate-700 text-sm">สรุปผลการดำเนินงานแต่ละคัน</span>
                  <span className="text-xs text-slate-400">{displayMonthYear(monthYear)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1E3A5F] text-white">
                        <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">คนขับ / รถ</th>
                        <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">เที่ยว</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">รายได้</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">ค่าน้ำมัน</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">ค่ารอบ+เงินเดือน</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">ค่าใช้จ่ายอื่น</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">ค่าใช้จ่ายประจำ</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">กำไรสุทธิ</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">สิ้นเปลือง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.driver_summaries.map((ds, i) => {
                        const margin = ds.total_revenue > 0
                          ? (ds.net_profit_after_fixed / ds.total_revenue * 100)
                          : 0;
                        return (
                          <tr key={ds.driver_id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors`}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">{ds.driver_nickname || ds.driver_name}</div>
                              {ds.truck_license_plate && (
                                <div className="text-xs text-slate-400 mt-0.5">{ds.truck_license_plate}</div>
                              )}
                              {ds.fuel_efficiency > 0 && (
                                <div className={`text-xs font-medium mt-1 ${ds.fuel_efficiency >= 3 ? 'text-teal-600' : 'text-orange-500'}`}>
                                  {formatNumber(ds.fuel_efficiency, 1)} กม./ล.
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center text-slate-600 font-medium">{ds.trip_count}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(ds.total_revenue)}</td>
                            <td className="px-4 py-3 text-right text-orange-700">
                              <div>{formatCurrency(ds.total_fuel_cost)}</div>
                              {ds.avg_fuel_price_per_litre > 0 && (
                                <div className="text-[11px] text-slate-400">฿{formatNumber(ds.avg_fuel_price_per_litre, 1)}/ล.</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-blue-700">
                              <div>{formatCurrency(ds.gross_driver_cost)}</div>
                              <div className="text-[11px] text-slate-400">รอบ {formatCurrency(ds.total_commission)}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              <div>{formatCurrency(ds.total_other_cost)}</div>
                              {(ds.total_extra_expenses || 0) > 0 && <div className="text-[11px] text-slate-400">+{formatCurrency(ds.total_extra_expenses)} เพิ่มเติม</div>}
                            </td>
                            <td className="px-4 py-3 text-right text-purple-700">
                              {ds.truck_fixed_cost > 0
                                ? <div>{formatCurrency(ds.truck_fixed_cost)}</div>
                                : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className={`font-bold text-base ${ds.net_profit_after_fixed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(ds.net_profit_after_fixed)}
                              </div>
                              <div className={`text-[11px] font-medium ${margin >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                {margin.toFixed(1)}%
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500 text-xs">
                              <div>{formatNumber(ds.fuel_efficiency, 1)} กม./ล.</div>
                              <div className="text-slate-400">{formatNumber(ds.total_distance)} กม.</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-700">
                        <td className="px-4 py-3">รวมทุกคัน</td>
                        <td className="px-3 py-3 text-center">{report.totals.trip_count}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(report.totals.total_revenue)}</td>
                        <td className="px-4 py-3 text-right text-orange-700 font-bold">{formatCurrency(report.totals.total_fuel_cost)}</td>
                        <td className="px-4 py-3 text-right text-blue-700 font-bold">{formatCurrency(report.totals.total_driver_cost)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(report.totals.total_other_cost)}</td>
                        <td className="px-4 py-3 text-right text-purple-700">
                          <div className="font-bold">{formatCurrency(totalAllFixed)}</div>
                          <div className="text-[11px] text-slate-400">ทุกรายการ</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`font-bold text-base ${report.totals.net_after_fixed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(report.totals.net_after_fixed)}
                          </div>
                          <div className="text-[11px] text-slate-400">หลังหักทั้งหมด</div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {report.totals.avg_fuel_price_per_litre > 0 && `฿${formatNumber(report.totals.avg_fuel_price_per_litre, 1)}/ล.`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Fixed expenses & Grand total side by side ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Fixed expenses table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="font-semibold text-slate-700 text-sm">ค่าใช้จ่ายประจำเดือน</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700 text-white text-xs">
                        <th className="text-left px-4 py-2.5 font-medium">รายการ</th>
                        <th className="text-left px-3 py-2.5 font-medium">รถ</th>
                        <th className="text-right px-4 py-2.5 font-medium">จำนวน</th>
                        <th className="text-center px-3 py-2.5 font-medium">งวด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(report.fixed_expenses.filter(fe => fe.is_active)).length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">ไม่มีรายการ</td></tr>
                      ) : (
                        report.fixed_expenses.filter(fe => fe.is_active).map((fe, i) => {
                          const isInst = fe.total_installments !== null;
                          const done = isInst && fe.remaining_installments === 0;
                          return (
                            <tr key={fe.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-slate-800">{fe.name}</div>
                                <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[fe.category] || 'bg-gray-100 text-gray-700'}`}>
                                  {CATEGORY_LABELS[fe.category] || fe.category}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs">{fe.truck_license_plate || 'บริษัท'}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatCurrency(fe.amount)}</td>
                              <td className="px-3 py-2.5 text-center text-xs">
                                {isInst ? (
                                  <div>
                                    <div className={`font-medium ${done ? 'text-green-600' : 'text-slate-700'}`}>
                                      {done ? 'ครบแล้ว' : `เหลือ ${fe.remaining_installments} งวด`}
                                    </div>
                                    <div className="text-slate-400">{fe.paid_installments}/{fe.total_installments}</div>
                                  </div>
                                ) : <span className="text-slate-400">ต่อเนื่อง</span>}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-purple-50 border-t-2 border-purple-200">
                        <td colSpan={2} className="px-4 py-3 font-semibold text-purple-800">รวมค่าใช้จ่ายประจำ</td>
                        <td className="px-4 py-3 text-right font-bold text-purple-800">{formatCurrency(totalAllFixed)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Grand total summary box */}
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                      <span className="font-semibold text-slate-700 text-sm">สรุปผลประกอบการ</span>
                    </div>
                    <div className="p-5 space-y-3">
                      <SummaryRow label="รายได้รวมทั้งหมด" value={formatCurrency(report.totals.total_revenue)} valueClass="text-green-600 font-bold text-lg" />
                      <div className="border-t border-dashed border-slate-200 pt-3 space-y-2">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">หักค่าใช้จ่าย</div>
                        <SummaryRow label="ค่าน้ำมัน" value={`- ${formatCurrency(report.totals.total_fuel_cost)}`} valueClass="text-orange-600" />
                        <SummaryRow label="ค่าคนขับรวม (รอบ+เงินเดือน)" value={`- ${formatCurrency(report.totals.total_driver_cost)}`} valueClass="text-blue-600" />
                        <SummaryRow label="ค่าใช้จ่ายอื่นๆ (เที่ยว)" value={`- ${formatCurrency(report.totals.total_other_cost)}`} valueClass="text-slate-600" />
                        <SummaryRow label="ค่าใช้จ่ายเพิ่มเติม" value={`- ${formatCurrency(report.totals.total_extra_expenses || 0)}`} valueClass="text-slate-600" />
                        <SummaryRow label="ค่าใช้จ่ายประจำ" value={`- ${formatCurrency(totalAllFixed)}`} valueClass="text-purple-600" />
                      </div>
                      <div className="border-t-2 border-slate-300 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-base">กำไรสุทธิ</span>
                          <span className={`font-bold text-2xl ${report.totals.net_after_fixed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(report.totals.net_after_fixed)}
                          </span>
                        </div>
                        {report.totals.total_revenue > 0 && (
                          <div className="text-right mt-1">
                            <span className={`text-sm font-medium ${report.totals.net_after_fixed >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                              Margin {(report.totals.net_after_fixed / report.totals.total_revenue * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox label="เฉลี่ยน้ำมัน/ลิตร" value={`฿${formatNumber(report.totals.avg_fuel_price_per_litre, 2)}`} />
                    <StatBox label="รวมระยะทาง" value={`${formatNumber(report.totals.total_distance)} กม.`} />
                    <StatBox label="น้ำมันทั้งหมด" value={`${formatNumber(report.totals.total_fuel_litres, 0)} ลิตร`} />
                    <StatBox label="จำนวนเที่ยว" value={`${report.totals.trip_count} เที่ยว`} />
                  </div>
                </div>
              </div>

            </div>
          )}

          {!loading && !report && !error && (
            <div className="text-center py-20 text-slate-400">ไม่มีข้อมูล</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: Fixed Expenses Management
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'fixed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">ค่าใช้จ่ายที่ต้องจ่ายทุกเดือน — ประกัน, ค่างวด, ภาษี</p>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />เพิ่มรายการ
            </button>
          </div>

          {feLoading && <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>}

          {!feLoading && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {fixedList.length === 0 ? (
                <div className="text-center py-16 text-slate-400">ยังไม่มีรายการค่าใช้จ่ายประจำ</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">รายการ</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">หมวด</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">รถ</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">จำนวน/เดือน</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">สถานะงวด</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">ใช้งาน</th>
                      <th className="px-4 py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fixedList.map((fe, i) => {
                      const isInst = fe.total_installments !== null;
                      const remaining = fe.remaining_installments;
                      const done = isInst && remaining === 0;
                      return (
                        <tr key={fe.id} className={`hover:bg-slate-50 ${!fe.is_active ? 'opacity-50' : ''} ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{fe.name}</div>
                            {fe.notes && <div className="text-xs text-slate-400 mt-0.5">{fe.notes}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[fe.category] || 'bg-gray-100 text-gray-700'}`}>
                              {CATEGORY_LABELS[fe.category] || fe.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-sm">{fe.truck_license_plate || <span className="text-slate-400 italic text-xs">ทุกคัน</span>}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(fe.amount)}</td>
                          <td className="px-4 py-3 text-center">
                            {isInst ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-xs font-semibold ${done ? 'text-green-600' : remaining === 1 ? 'text-orange-500' : 'text-slate-700'}`}>
                                  {done ? 'ชำระครบ' : `เหลือ ${remaining} งวด`}
                                </span>
                                <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, (fe.paid_installments / (fe.total_installments || 1)) * 100)}%` }} />
                                </div>
                                <span className="text-[11px] text-slate-400">{fe.paid_installments}/{fe.total_installments} งวด</span>
                              </div>
                            ) : <span className="text-slate-400 text-xs">ต่อเนื่อง</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${fe.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {fe.is_active ? 'ใช้งาน' : 'ปิด'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {isInst && !done && (
                                <button onClick={() => markPaid(fe)} title="บันทึกชำระงวด" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50">
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => openEdit(fe)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteFE(fe.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-purple-50 border-t-2 border-purple-200">
                      <td colSpan={3} className="px-4 py-3 font-semibold text-purple-800">รวมค่าใช้จ่ายประจำ (รายการที่ใช้งานอยู่)</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-800 text-base">
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

      {/* ── FE Modal ── */}
      {showFEModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-slate-800">{editingFE ? 'แก้ไขรายการ' : 'เพิ่มค่าใช้จ่ายประจำ'}</h2>
              <button onClick={() => setShowFEModal(false)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {feError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{feError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อรายการ *</label>
                  <input value={feForm.name} onChange={e => setFeForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เช่น ประกันชั้น 1 รถ 71-1831" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">หมวดหมู่</label>
                  <select value={feForm.category} onChange={e => setFeForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ทะเบียนรถ</label>
                  <select
                    value={feForm.truck_license_plate}
                    onChange={e => setFeForm(p => ({ ...p, truck_license_plate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— ไม่ระบุรถ (ค่าใช้จ่ายบริษัท) —</option>
                    {driverPlates.map(d => (
                      <option key={d.id} value={d.license_plate}>
                        {d.nickname} — {d.license_plate}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">เลือกรถที่ค่าใช้จ่ายนี้ผูกด้วย หากเป็นค่าใช้จ่ายของบริษัทให้เว้นว่าง</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนเงิน/เดือน (บาท) *</label>
                  <input type="number" value={feForm.amount} onChange={e => setFeForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ครบกำหนดจ่าย</label>
                  <input type="number" min="1" max="31" value={feForm.due_day} onChange={e => setFeForm(p => ({ ...p, due_day: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เช่น 5" />
                </div>
                <div className="col-span-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500 mb-3">ข้อมูลผ่อนชำระ (ถ้าเป็นค่างวด)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนงวดทั้งหมด</label>
                      <input type="number" min="1" value={feForm.total_installments} onChange={e => setFeForm(p => ({ ...p, total_installments: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="-" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">ชำระแล้ว (งวด)</label>
                      <input type="number" min="0" value={feForm.paid_installments} onChange={e => setFeForm(p => ({ ...p, paid_installments: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">เริ่มผ่อนวันที่</label>
                      <input type="date" value={feForm.start_date} onChange={e => setFeForm(p => ({ ...p, start_date: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
                  <input value={feForm.notes} onChange={e => setFeForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="fe-active" checked={feForm.is_active} onChange={e => setFeForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                  <label htmlFor="fe-active" className="text-sm text-slate-700">ใช้งานอยู่ (นับรวมในรายงาน)</label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 sticky bottom-0">
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

// ─── Sub-components ────────────────────
function SummaryCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: string; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl border border-slate-200/60 px-4 py-3 shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={`font-bold text-lg leading-tight ${color}`}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600 text-sm">{label}</span>
      <span className={`font-semibold text-sm ${valueClass || 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-bold text-slate-700 mt-0.5">{value}</div>
    </div>
  );
}
