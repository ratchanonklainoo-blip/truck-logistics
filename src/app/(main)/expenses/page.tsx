'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Receipt, Plus, RefreshCw, Filter, Trash2, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Driver { id: string; name: string; nickname: string; }
interface Expense {
  id: string; job_id: string | null; trip_id: string | null; driver_id: string | null;
  category: string; description: string | null; amount: number;
  receipt_url: string | null; date: string; created_at: string;
  driver?: { id: string; name: string; nickname: string } | null;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fuel:    { label: 'น้ำมัน',       color: 'text-orange-700', bg: 'bg-orange-100' },
  toll:    { label: 'ค่าทางด่วน',   color: 'text-blue-700',   bg: 'bg-blue-100' },
  repair:  { label: 'ซ่อมบำรุง',   color: 'text-red-700',    bg: 'bg-red-100' },
  food:    { label: 'ค่าอาหาร',    color: 'text-green-700',  bg: 'bg-green-100' },
  parking: { label: 'จอดรถ',        color: 'text-slate-700',  bg: 'bg-slate-100' },
  advance: { label: 'เบิกเงิน',     color: 'text-purple-700', bg: 'bg-purple-100' },
  other:   { label: 'อื่นๆ',         color: 'text-gray-700',   bg: 'bg-gray-100' },
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
};

export default function ExpensesPage() {
  const [supabase] = useState(() => createClient());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDriver, setFilterDriver] = useState('all');
  const [dateRange, setDateRange] = useState(getCurrentMonthRange());
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: exp }, { data: dr }] = await Promise.all([
      supabase.from('expenses').select('*').is('deleted_at', null)
        .gte('date', dateRange.from).lte('date', dateRange.to)
        .order('date', { ascending: false }).limit(300),
      supabase.from('drivers').select('id,name,nickname').is('deleted_at', null).eq('is_active', true),
    ]);
    const drList = dr || [];
    setDrivers(drList);
    const drMap: Record<string, Driver> = {};
    drList.forEach(d => { drMap[d.id] = d; });
    const enriched = (exp || []).map(e => ({ ...e, driver: e.driver_id ? drMap[e.driver_id] || null : null }));
    setExpenses(enriched as Expense[]);
    setLoading(false);
  }, [supabase, dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => expenses.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterDriver !== 'all' && e.driver_id !== filterDriver) return false;
    return true;
  }), [expenses, filterCategory, filterDriver]);

  const total = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return map;
  }, [expenses]);

  const handleDelete = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      await loadData();
    } finally { setDeleting(null); }
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
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Receipt className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ค่าใช้จ่าย</h1>
            <p className="text-sm text-slate-500">ติดตามค่าใช้จ่ายทั้งหมด</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /> รีเฟรช</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> เพิ่มรายการ</button>
        </div>
      </div>

      {/* Category Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(CATEGORY_CONFIG).map(([k, v]) => {
          const amt = byCategory[k] || 0;
          if (amt === 0) return null;
          return (
            <div key={k} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.bg} ${v.color}`}>{v.label}</span>
              <div className="text-lg font-bold text-slate-800 mt-2">{formatCurrency(amt)}</div>
            </div>
          );
        })}
      </div>

      {/* Filters + Date */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <input type="date" className="form-input text-sm w-36" value={dateRange.from}
          onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))} />
        <span className="text-slate-400">ถึง</span>
        <input type="date" className="form-input text-sm w-36" value={dateRange.to}
          onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))} />
        <select className="form-input text-sm w-36" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">ทุกประเภท</option>
          {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="form-input text-sm w-44" value={filterDriver} onChange={e => setFilterDriver(e.target.value)}>
          <option value="all">คนขับทั้งหมด</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname}</option>)}
        </select>
        <div className="ml-auto text-sm font-semibold text-slate-700">
          รวม: <span className="text-red-600">{formatCurrency(total)}</span>
          <span className="text-slate-400 font-normal ml-2">({filtered.length} รายการ)</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            ไม่พบรายการค่าใช้จ่าย
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['วันที่','คนขับ','ประเภท','รายละเอียด','จำนวน',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(e => {
                const cc = CATEGORY_CONFIG[e.category] || CATEGORY_CONFIG['other'];
                return (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {e.driver?.nickname || e.driver?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cc.bg} ${cc.color}`}>
                        {cc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.description || '-'}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                        className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateExpenseModal
          drivers={drivers}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData(); }}
        />
      )}
    </div>
  );
}

function CreateExpenseModal({ drivers, onClose, onCreated }:
  { drivers: Driver[]; onClose: () => void; onCreated: () => void; }) {
  const [form, setForm] = useState({
    driver_id: '', category: 'fuel', description: '', amount: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.amount) { setError('กรุณากรอกจำนวนเงิน'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), driver_id: form.driver_id || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return; }
      onCreated();
    } finally { setLoading(false); }
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">เพิ่มค่าใช้จ่าย</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">วันที่</label>
              <input type="date" className="form-input" value={form.date} onChange={e => f('date', e.target.value)} />
            </div>
            <div>
              <label className="label-text">ประเภท</label>
              <select className="form-input" value={form.category} onChange={e => f('category', e.target.value)}>
                {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">คนขับ</label>
            <select className="form-input" value={form.driver_id} onChange={e => f('driver_id', e.target.value)}>
              <option value="">- ไม่ระบุ -</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname} ({d.name})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">รายละเอียด</label>
            <input className="form-input" value={form.description} onChange={e => f('description', e.target.value)} placeholder="เช่น ค่าซ่อมยาง" />
          </div>
          <div>
            <label className="label-text">จำนวนเงิน (บาท) *</label>
            <input type="number" className="form-input" value={form.amount} onChange={e => f('amount', e.target.value)} />
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
