'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Wallet, RefreshCw, Calculator, CheckCircle, Banknote, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Driver { id: string; name: string; nickname: string; base_salary: number; social_security: number; }
interface Payroll {
  id: string; driver_id: string; month_year: string;
  base_salary: number; total_commission: number; total_advance: number;
  social_security: number; other_deductions: number; other_additions: number;
  gross_pay: number; net_pay: number; trip_count: number; total_distance: number;
  status: 'draft' | 'approved' | 'paid';
  approved_at: string | null; paid_at: string | null;
  driver?: Driver | null;
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

const STATUS_CONFIG = {
  draft:    { label: 'ร่าง',        color: 'text-slate-700', bg: 'bg-slate-100' },
  approved: { label: 'อนุมัติแล้ว', color: 'text-blue-700',  bg: 'bg-blue-100' },
  paid:     { label: 'จ่ายแล้ว',    color: 'text-green-700', bg: 'bg-green-100' },
};

export default function PayrollPage() {
  const [supabase] = useState(() => createClient());
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthYear());
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: pay }, { data: dr }] = await Promise.all([
      supabase.from('payrolls').select('*').is('deleted_at', null)
        .eq('month_year', selectedMonth).order('created_at', { ascending: true }),
      supabase.from('drivers').select('id,name,nickname,base_salary,social_security').is('deleted_at', null).eq('is_active', true),
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

  const handleAction = async (id: string, action: 'approve' | 'pay') => {
    if (action === 'pay' && !confirm('ยืนยันการจ่ายเงินเดือน?')) return;
    setActionLoading(id + '-' + action);
    try {
      const res = await fetch(`/api/payroll/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error); return; }
      await loadData();
    } finally { setActionLoading(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
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
          <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={generateAll} disabled={generating} className="btn-primary text-sm">
            {generating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Calculator className="w-4 h-4" />}
            คำนวณทั้งหมด
          </button>
        </div>
      </div>

      <div className="text-lg font-semibold text-slate-600">
        {formatMonthYear(selectedMonth)}
      </div>

      {payrolls.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Calculator className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>ยังไม่มีข้อมูลเงินเดือนเดือนนี้</p>
          <p className="text-sm mt-2">กดปุ่ม "คำนวณทั้งหมด" เพื่อคำนวณจากข้อมูลเที่ยววิ่ง</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payrolls.map(p => {
            const sc = STATUS_CONFIG[p.status];
            const isExpanded = expanded === p.id;
            const driverName = p.driver?.nickname || p.driver?.name || 'ไม่ระบุ';
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800">{driverName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.color}`}>{sc.label}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {p.trip_count} เที่ยว · {(p.total_distance || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })} กม.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-emerald-600">{formatCurrency(p.net_pay)}</div>
                    <div className="text-xs text-slate-400">เงินสุทธิ</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === 'draft' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleAction(p.id, 'approve'); }}
                        disabled={actionLoading === p.id + '-approve'}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" /> อนุมัติ
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleAction(p.id, 'pay'); }}
                        disabled={actionLoading === p.id + '-pay'}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Banknote className="w-3 h-3" /> จ่ายเงิน
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs mb-1">รายได้</p>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>เงินเดือนพื้นฐาน</span>
                            <span className="font-medium">{formatCurrency(p.base_salary)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ค่ารอบ (commission)</span>
                            <span className="font-medium">{formatCurrency(p.total_commission)}</span>
                          </div>
                          {p.other_additions > 0 && (
                            <div className="flex justify-between text-green-700">
                              <span>รายได้เพิ่มเติม</span>
                              <span className="font-medium">+{formatCurrency(p.other_additions)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold border-t border-slate-200 pt-1 mt-1">
                            <span>รวมรายได้</span>
                            <span>{formatCurrency(p.gross_pay)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">รายการหัก</p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-red-600">
                            <span>เงินเบิกล่วงหน้า</span>
                            <span className="font-medium">-{formatCurrency(p.total_advance)}</span>
                          </div>
                          <div className="flex justify-between text-red-600">
                            <span>ประกันสังคม</span>
                            <span className="font-medium">-{formatCurrency(p.social_security)}</span>
                          </div>
                          {p.other_deductions > 0 && (
                            <div className="flex justify-between text-red-600">
                              <span>หักอื่นๆ</span>
                              <span className="font-medium">-{formatCurrency(p.other_deductions)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">สรุป</p>
                        <div className="bg-white rounded-lg p-3 border border-emerald-200">
                          <div className="text-xs text-slate-500">เงินสุทธิ (ปัดลงหลัก 10)</div>
                          <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(p.net_pay)}</div>
                        </div>
                      </div>
                    </div>
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
