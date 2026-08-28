'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList, Plus, RefreshCw, Filter, ChevronRight,
  Truck, User, Building2, Package, Banknote, X, Check,
  Clock, Search, Edit2, Trash2, Calendar,
  Sparkles, FileText,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Driver { id: string; name: string; nickname: string; license_plate: string; }
interface Customer { id: string; name: string; payment_type: string; }
interface Job {
  id: string; job_number: string; date: string;
  customer_id: string | null; origin: string; destination: string;
  product: string | null; weight_kg: number | null; selling_price: number;
  source: string; payment_type: string; payment_due_date: string | null;
  assigned_driver_id: string | null; status: string; notes: string | null;
  created_at: string;
  driver?: { id: string; name: string; nickname: string } | null;
  customer?: { id: string; name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  new:             { label: 'งานใหม่',       color: 'text-slate-700',  bg: 'bg-slate-100',   dot: 'bg-slate-400' },
  waiting_driver:  { label: 'รอจัดรถ',       color: 'text-yellow-700', bg: 'bg-yellow-100',  dot: 'bg-yellow-400' },
  assigned:        { label: 'จัดรถแล้ว',     color: 'text-blue-700',   bg: 'bg-blue-100',    dot: 'bg-blue-500' },
  driver_accepted: { label: 'คนขับรับงาน',  color: 'text-indigo-700', bg: 'bg-indigo-100',  dot: 'bg-indigo-500' },
  in_progress:     { label: 'กำลังวิ่ง',     color: 'text-orange-700', bg: 'bg-orange-100',  dot: 'bg-orange-500' },
  delivered:       { label: 'ส่งงานแล้ว',   color: 'text-teal-700',   bg: 'bg-teal-100',    dot: 'bg-teal-500' },
  waiting_payment: { label: 'รอรับเงิน',     color: 'text-purple-700', bg: 'bg-purple-100',  dot: 'bg-purple-500' },
  closed:          { label: 'ปิดงานแล้ว',   color: 'text-green-700',  bg: 'bg-green-100',   dot: 'bg-green-500' },
};

const NEXT_STATUS: Record<string, string> = {
  new: 'waiting_driver', waiting_driver: 'assigned', assigned: 'driver_accepted',
  driver_accepted: 'in_progress', in_progress: 'delivered',
  delivered: 'waiting_payment', waiting_payment: 'closed',
};
const NEXT_LABEL: Record<string, string> = {
  new: 'รอจัดรถ', waiting_driver: 'จัดรถแล้ว', assigned: 'คนขับรับงาน',
  driver_accepted: 'เริ่มวิ่ง', in_progress: 'ส่งงานแล้ว',
  delivered: 'รอรับเงิน', waiting_payment: 'ปิดงาน',
};
const SOURCE_LABEL: Record<string, string> = { bank: 'Bank', mother: 'Mother', driver: 'คนขับ', ai: 'AI' };

function getToday() { return new Date().toISOString().slice(0, 10); }
function getMonthStart() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

export default function JobsPage() {
  const [supabase] = useState(() => createClient());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(getToday());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState<Job | null>(null);
  const [showEdit, setShowEdit] = useState<Job | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: j }, { data: dr }, { data: cu }] = await Promise.all([
      supabase.from('jobs').select('*').is('deleted_at', null)
        .gte('date', dateFrom).lte('date', dateTo)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('drivers').select('id,name,nickname,license_plate').is('deleted_at', null).eq('is_active', true),
      supabase.from('customers').select('id,name,payment_type').is('deleted_at', null).eq('is_active', true),
    ]);
    const drList = dr || [];
    const cuList = cu || [];
    setDrivers(drList);
    setCustomers(cuList);
    const drMap: Record<string, Driver> = {};
    drList.forEach(d => { drMap[d.id] = d; });
    const cuMap: Record<string, Customer> = {};
    cuList.forEach(c => { cuMap[c.id] = c; });
    const enriched = (j || []).map(job => ({
      ...job,
      driver: job.assigned_driver_id ? drMap[job.assigned_driver_id] || null : null,
      customer: job.customer_id ? cuMap[job.customer_id] || null : null,
    }));
    setJobs(enriched as Job[]);
    setLoading(false);
  }, [supabase, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (filterStatus !== 'all') list = list.filter(j => j.status === filterStatus);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(j =>
        j.origin.toLowerCase().includes(q) ||
        j.destination.toLowerCase().includes(q) ||
        (j.product || '').toLowerCase().includes(q) ||
        (j.customer?.name || '').toLowerCase().includes(q) ||
        (j.driver?.nickname || j.driver?.name || '').toLowerCase().includes(q) ||
        (j.job_number || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, filterStatus, searchText]);

  const stats = useMemo(() => ({
    active: jobs.filter(j => j.status !== 'closed').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    waitingPayment: jobs.filter(j => j.status === 'waiting_payment').length,
    todayRevenue: jobs
      .filter(j => j.status === 'closed' && j.date === getToday())
      .reduce((s, j) => s + j.selling_price, 0),
  }), [jobs]);

  const advanceStatus = async (job: Job) => {
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    setActionLoading(job.id + '-advance');
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error); return; }
      await loadData();
    } catch {
      alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setActionLoading(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบงานนี้?')) return;
    setActionLoading(id + '-delete');
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); alert(e.error || 'ลบงานไม่สำเร็จ'); return; }
      await loadData();
    } catch {
      alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setActionLoading(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">งานเข้า</h1>
            <p className="text-sm text-slate-500">จัดการงานและติดตามสถานะ</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> เพิ่มงาน
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'งานที่ยังเปิด',      value: stats.active,           icon: ClipboardList, color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'กำลังวิ่ง',          value: stats.inProgress,       icon: Truck,         color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'รอรับเงิน',          value: stats.waitingPayment,   icon: Clock,         color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'รายได้ปิดงานวันนี้', value: formatCurrency(stats.todayRevenue), icon: Banknote, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-xl font-bold text-slate-800">{value}</div>
            <div className="text-sm text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Search + Date Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหา: ต้นทาง ปลายทาง สินค้า ลูกค้า คนขับ เลขงาน..."
              className="form-input pl-9 text-sm"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Calendar className="w-4 h-4" />
            <input type="date" className="form-input text-sm w-36" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
            <span>–</span>
            <input type="date" className="form-input text-sm w-36" value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          <span className="text-sm text-slate-400 whitespace-nowrap">{filtered.length} รายการ</span>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-slate-400" />
          <button
            onClick={() => setFilterStatus('all')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            ทั้งหมด ({jobs.length})
          </button>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => {
            const count = jobs.filter(j => j.status === k).length;
            if (count === 0) return null;
            return (
              <button key={k}
                onClick={() => setFilterStatus(k)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === k ? `${v.bg} ${v.color} ring-2 ring-current ring-offset-1` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {v.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Job Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          {searchText ? `ไม่พบงานที่ตรงกับ "${searchText}"` : 'ไม่พบรายการงาน'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => {
            const sc = STATUS_CONFIG[job.status] || STATUS_CONFIG['new'];
            const nextStatus = NEXT_STATUS[job.status];
            const isDeleting = actionLoading === job.id + '-delete';
            const isAdvancing = actionLoading === job.id + '-advance';
            return (
              <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">{job.job_number || job.id.slice(0, 8)}</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {SOURCE_LABEL[job.source] || job.source}
                      </span>
                      {job.payment_type === 'credit' && (
                        <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">
                          เครดิต {job.payment_due_date ? `ครบ ${new Date(job.payment_due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : ''}
                        </span>
                      )}
                      {job.payment_type === 'prepaid' && (
                        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">จ่ายล่วงหน้า</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-800 font-bold text-base mb-1.5">
                      <span>{job.origin}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>{job.destination}</span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {job.customer && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {job.customer.name}
                        </span>
                      )}
                      {job.driver ? (
                        <span className="flex items-center gap-1 text-indigo-600 font-medium">
                          <User className="w-3.5 h-3.5" />
                          {job.driver.nickname || job.driver.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-600">
                          <User className="w-3.5 h-3.5" />
                          ยังไม่ได้จัดรถ
                        </span>
                      )}
                      {job.product && (
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          {job.product}
                          {job.weight_kg ? ` · ${job.weight_kg.toLocaleString('th-TH')} กก.` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-blue-700 font-semibold">
                        <Banknote className="w-3.5 h-3.5" />
                        {formatCurrency(job.selling_price)}
                      </span>
                    </div>

                    {job.notes && (
                      <p className="text-xs text-slate-400 mt-1.5 italic">{job.notes}</p>
                    )}
                  </div>

                  {/* Right: date + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-400">
                      {new Date(job.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Assign driver button */}
                      {!job.assigned_driver_id && ['new','waiting_driver'].includes(job.status) && (
                        <button
                          onClick={() => setShowAssign(job)}
                          className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Truck className="w-3 h-3" /> จัดรถ
                        </button>
                      )}

                      {/* Advance status button */}
                      {nextStatus && (
                        <button
                          onClick={() => advanceStatus(job)}
                          disabled={isAdvancing}
                          className="text-xs px-2.5 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isAdvancing
                            ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            : <Check className="w-3 h-3" />}
                          {NEXT_LABEL[job.status]}
                        </button>
                      )}

                      {/* Edit */}
                      <button
                        onClick={() => setShowEdit(job)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={isDeleting}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="ลบ"
                      >
                        {isDeleting
                          ? <div className="w-3.5 h-3.5 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <JobFormModal
          drivers={drivers} customers={customers} job={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadData(); }}
        />
      )}
      {showEdit && (
        <JobFormModal
          drivers={drivers} customers={customers} job={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); loadData(); }}
        />
      )}
      {showAssign && (
        <AssignDriverModal
          job={showAssign} drivers={drivers}
          onClose={() => setShowAssign(null)}
          onAssigned={() => { setShowAssign(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ── Job Form Modal (Create + Edit) ────────────────────────────
function JobFormModal({ drivers, customers, job, onClose, onSaved }: {
  drivers: Driver[]; customers: Customer[];
  job: Job | null; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!job;
  const [form, setForm] = useState({
    date: job?.date || getToday(),
    customer_id: job?.customer_id || '',
    origin: job?.origin || '',
    destination: job?.destination || '',
    product: job?.product || '',
    weight_kg: job?.weight_kg?.toString() || '',
    selling_price: job?.selling_price?.toString() || '',
    source: job?.source || 'bank',
    payment_type: job?.payment_type || 'on_completion',
    payment_due_date: job?.payment_due_date || '',
    assigned_driver_id: job?.assigned_driver_id || '',
    notes: job?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [supabase] = useState(() => createClient());
  const [showAiParser, setShowAiParser] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [routePriceSuggestion, setRoutePriceSuggestion] = useState<number | null>(null);

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const lookupRoutePrice = async (origin: string, destination: string) => {
    if (!origin || !destination) { setRoutePriceSuggestion(null); return; }
    const { data } = await supabase.from('route_prices')
      .select('agreed_price').is('deleted_at', null)
      .ilike('origin', origin).ilike('destination', destination)
      .order('created_at', { ascending: false }).limit(1).single();
    setRoutePriceSuggestion(data ? data.agreed_price : null);
  };

  const runAiParser = async () => {
    if (!aiText.trim()) return;
    setAiParsing(true);
    setAiError('');
    try {
      const res = await fetch('/api/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      });
      const body = await res.json();
      if (!res.ok || !body.data) {
        setAiError(body.error || 'วิเคราะห์ข้อความไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      const data = body.data;
      setForm(p => ({
        ...p,
        origin: data.origin || p.origin,
        destination: data.destination || p.destination,
        product: data.product || p.product,
        weight_kg: data.weight_kg || p.weight_kg,
        selling_price: data.selling_price ? String(data.selling_price) : p.selling_price,
        source: 'ai',
      }));
      setShowAiParser(false);
      setAiText('');
    } catch {
      setAiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally {
      setAiParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.origin || !form.destination || !form.selling_price) {
      setError('กรุณากรอกต้นทาง ปลายทาง และราคาค่าขนส่ง'); return;
    }
    if (form.payment_type === 'credit' && !form.payment_due_date) {
      setError('กรุณากรอกวันครบกำหนดสำหรับเครดิต'); return;
    }
    setLoading(true); setError('');
    try {
      const payload = {
        date: form.date,
        customer_id: form.customer_id || null,
        origin: form.origin, destination: form.destination,
        product: form.product || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        selling_price: Number(form.selling_price),
        source: form.source,
        payment_type: form.payment_type,
        payment_due_date: form.payment_due_date || null,
        assigned_driver_id: form.assigned_driver_id || null,
        notes: form.notes || null,
      };
      const url = isEdit ? `/api/jobs/${job!.id}` : '/api/jobs';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return; }
      onSaved();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setLoading(false); }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}</h2>
          <div className="flex items-center gap-2">
            {!isEdit && (
              <button onClick={() => setShowAiParser(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-xs font-medium transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> AI Parse
              </button>
            )}
            <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">วันที่</label>
              <input type="date" className="form-input" value={form.date} onChange={e => f('date', e.target.value)} />
            </div>
            <div>
              <label className="label-text">แหล่งงาน</label>
              <select className="form-input" value={form.source} onChange={e => f('source', e.target.value)}>
                <option value="bank">Bank</option>
                <option value="mother">Mother</option>
                <option value="driver">คนขับ</option>
                <option value="ai">AI</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">ลูกค้า</label>
            <select className="form-input" value={form.customer_id} onChange={e => f('customer_id', e.target.value)}>
              <option value="">- ไม่ระบุ -</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">ต้นทาง *</label>
              <input className="form-input" value={form.origin} onChange={e => { f('origin', e.target.value); lookupRoutePrice(e.target.value, form.destination); }} placeholder="เช่น ลพบุรี" />
            </div>
            <div>
              <label className="label-text">ปลายทาง *</label>
              <input className="form-input" value={form.destination} onChange={e => { f('destination', e.target.value); lookupRoutePrice(form.origin, e.target.value); }} placeholder="เช่น เชียงราย" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">สินค้า</label>
              <input className="form-input" value={form.product} onChange={e => f('product', e.target.value)} placeholder="เช่น ปุ๋ย, ข้าวโพด" />
            </div>
            <div>
              <label className="label-text">น้ำหนัก (กก.)</label>
              <input type="number" className="form-input" value={form.weight_kg} onChange={e => f('weight_kg', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-text">ราคาค่าขนส่ง (บาท) *</label>
            <input type="number" className="form-input" value={form.selling_price} onChange={e => f('selling_price', e.target.value)} />
                {routePriceSuggestion && (
                  <button type="button"
                    onClick={() => f('selling_price', String(routePriceSuggestion))}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    ราคาตกลงเส้นทางนี้: {routePriceSuggestion.toLocaleString('th-TH')} บาท — คลิกเพื่อใช้
                  </button>
                )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">รูปแบบชำระ</label>
              <select className="form-input" value={form.payment_type} onChange={e => f('payment_type', e.target.value)}>
                <option value="prepaid">จ่ายล่วงหน้า</option>
                <option value="on_completion">จ่ายเมื่อส่งงาน</option>
                <option value="credit">เครดิต</option>
              </select>
            </div>
            {form.payment_type === 'credit' && (
              <div>
                <label className="label-text">วันครบกำหนด *</label>
                <input type="date" className="form-input" value={form.payment_due_date} onChange={e => f('payment_due_date', e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="label-text">จัดรถ</label>
            <select className="form-input" value={form.assigned_driver_id} onChange={e => f('assigned_driver_id', e.target.value)}>
              <option value="">- ยังไม่จัด -</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname} ({d.license_plate})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">หมายเหตุ</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isEdit ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
    {/* AI Parser Modal */}
    {showAiParser && (
      <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
        onClick={() => { setShowAiParser(false); setAiError(''); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
          onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> AI สร้างงานจากข้อความ
            </h2>
            <button onClick={() => { setShowAiParser(false); setAiError(''); }}><X className="w-5 h-5 text-slate-400" /></button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-500">
              วาง/พิมพ์ข้อความงานจาก LINE กลุ่ม หรือโทรศัพท์ แล้วกด &quot;วิเคราะห์&quot; ระบบจะดึง origin, destination, สินค้า, ราคา ให้อัตโนมัติ
            </p>
            {aiError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{aiError}</div>}
            <textarea
              className="form-input w-full"
              rows={6}
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              placeholder="ตัวอย่าง: รับงานด่วน! ข้าวโพด 20 ตัน จาก เชียงราย ไป นครสวรรค์ ราคา 18,000 บาท"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAiParser(false)} className="btn-secondary">ยกเลิก</button>
              <button onClick={runAiParser} disabled={aiParsing || !aiText.trim()}
                className="btn-primary flex items-center gap-1.5">
                {aiParsing
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังวิเคราะห์...</>
                  : <><Sparkles className="w-4 h-4" /> วิเคราะห์และสร้างงาน</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
}

// ── Assign Driver Modal ───────────────────────────────────────
function AssignDriverModal({ job, drivers, onClose, onAssigned }:
  { job: Job; drivers: Driver[]; onClose: () => void; onAssigned: () => void; }) {
  const [driverId, setDriverId] = useState(job.assigned_driver_id || '');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!driverId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'assigned', assigned_driver_id: driverId }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error); return; }
      onAssigned();
    } catch {
      alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">จัดรถ</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-500 font-medium">{job.origin} → {job.destination}</p>
          <div>
            <label className="label-text">เลือกคนขับ</label>
            <select className="form-input" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">- เลือก -</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.nickname} — {d.license_plate}</option>)}
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={handleAssign} disabled={!driverId || loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Truck className="w-4 h-4" />}
            จัดรถ
          </button>
        </div>
      </div>
    </div>
  );
}