'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet, CheckCircle, XCircle, Clock, Banknote,
  RefreshCw, Filter, Plus,
} from 'lucide-react';
import type { AdvanceRequest, Driver } from '@/types';
import { formatCurrency } from '@/lib/utils';

const STATUS_CONFIG = {
  pending:  { label: 'รออนุมัติ', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  approved: { label: 'อนุมัติแล้ว', color: 'text-blue-700',   bg: 'bg-blue-100',   icon: CheckCircle },
  rejected: { label: 'ไม่อนุมัติ', color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  paid:     { label: 'จ่ายแล้ว',   color: 'text-green-700',  bg: 'bg-green-100',  icon: Banknote },
};

export default function AdvancesPage() {
  const [supabase] = useState(() => createClient());
  const [advances, setAdvances]       = useState<AdvanceRequest[]>([]);
  const [drivers, setDrivers]         = useState<Driver[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: adv, error: advErr }, { data: dr }] = await Promise.all([
      supabase
        .from('advance_requests')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
    ]);

    if (advErr) console.error('[Advances] load error:', advErr.message);

    const drList = dr || [];
    setDrivers(drList);

    // Merge driver info manually (no FK join)
    const drMap: Record<string, Driver> = {};
    drList.forEach(d => { drMap[d.id] = d; });

    const enriched = (adv || []).map(a => ({
      ...a,
      driver: drMap[a.driver_id] || undefined,
    }));

    setAdvances(enriched as AdvanceRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    return advances.filter(a => {
      if (selectedStatus !== 'all' && a.status !== selectedStatus) return false;
      if (selectedDriver !== 'all' && a.driver_id !== selectedDriver) return false;
      return true;
    });
  }, [advances, selectedStatus, selectedDriver]);

  const stats = useMemo(() => ({
    pending:  advances.filter(a => a.status === 'pending').length,
    approved: advances.filter(a => a.status === 'approved').length,
    totalPaid: advances.filter(a => a.status === 'paid').reduce((s, a) => s + a.amount, 0),
  }), [advances]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'pay') => {
    if (action === 'pay' && !confirm('ยืนยันการจ่ายเงิน?')) return;
    setActionLoading(id + '-' + action);
    try {
      const res = await fetch(`/api/advances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'เกิดข้อผิดพลาด');
        return;
      }
      await loadData();
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">เบิกเงิน</h1>
            <p className="text-sm text-slate-500">คำขอเบิกเงินจากคนขับ</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" /> รีเฟรช
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.pending}</div>
          <div className="text-sm text-slate-500 mt-1">รออนุมัติ</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.approved}</div>
          <div className="text-sm text-slate-500 mt-1">อนุมัติแล้ว รอจ่าย</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center mb-3">
            <Banknote className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(stats.totalPaid)}</div>
          <div className="text-sm text-slate-500 mt-1">จ่ายแล้วทั้งหมด</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select className="form-input text-sm w-40" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
          <option value="all">ทุกสถานะ</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select className="form-input text-sm w-48" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
          <option value="all">คนขับทั้งหมด</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname}</option>)}
        </select>
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} รายการ</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Wallet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            ไม่พบรายการเบิกเงิน
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['คนขับ','จำนวน','เหตุผล','สถานะ','วันที่ขอ','ดำเนินการ'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(a => {
                const sc = STATUS_CONFIG[a.status];
                const StatusIcon = sc.icon;
                const driver = a.driver as Driver | undefined;
                return (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {driver?.nickname || driver?.name || '-'}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-700">
                      {formatCurrency(a.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.reason || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(a.created_at).toLocaleDateString('th-TH', {
                        day: 'numeric', month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {a.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(a.id, 'approve')}
                              disabled={actionLoading === a.id + '-approve'}
                              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> อนุมัติ
                            </button>
                            <button
                              onClick={() => handleAction(a.id, 'reject')}
                              disabled={actionLoading === a.id + '-reject'}
                              className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" /> ปฏิเสธ
                            </button>
                          </>
                        )}
                        {a.status === 'approved' && (
                          <button
                            onClick={() => handleAction(a.id, 'pay')}
                            disabled={actionLoading === a.id + '-pay'}
                            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <Banknote className="w-3 h-3" /> จ่ายเงิน
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateAdvanceModal
          drivers={drivers}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData(); }}
        />
      )}
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────
function CreateAdvanceModal({
  drivers, onClose, onCreated,
}: {
  drivers: Driver[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ driver_id: '', amount: '', reason: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.driver_id || !form.amount) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: form.driver_id, amount: Number(form.amount), reason: form.reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return; }
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">เพิ่มรายการเบิกเงิน</h2>
          <button onClick={onClose}><XCircle className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
          <div>
            <label className="label-text">คนขับ</label>
            <select className="form-input" value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}>
              <option value="">- เลือกคนขับ -</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname} ({d.name})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">จำนวนเงิน (บาท)</label>
            <input type="number" className="form-input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label className="label-text">เหตุผล</label>
            <input className="form-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="เช่น ค่าข้าว ค่าน้ำมัน" />
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
