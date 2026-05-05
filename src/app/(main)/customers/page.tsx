'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Pencil, Phone, MapPin, CreditCard,
  ChevronRight, ChevronDown, X, Check, Banknote,
  AlertCircle, Clock, CheckCircle,
} from 'lucide-react';
import type { Customer } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface JobSummary {
  id: string; date: string; origin: string; destination: string;
  status: string; selling_price: number; payment_type: string;
  payment_due_date: string | null;
}

interface CustomerWithStats extends Customer {
  jobCount: number;
  totalRevenue: number;
  overdueAmount: number;
  waitingAmount: number;
  jobs?: JobSummary[];
}

const PAYMENT_LABELS: Record<string, string> = {
  prepaid: 'จ่ายล่วงหน้า',
  on_completion: 'จ่ายเมื่อส่ง',
  credit: 'เครดิต',
};

const JOB_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'งานใหม่', color: 'text-slate-500' },
  waiting_driver: { label: 'รอจัดรถ', color: 'text-yellow-600' },
  assigned: { label: 'จัดรถแล้ว', color: 'text-blue-600' },
  driver_accepted: { label: 'รับงาน', color: 'text-indigo-600' },
  in_progress: { label: 'กำลังวิ่ง', color: 'text-orange-600' },
  delivered: { label: 'ส่งแล้ว', color: 'text-teal-600' },
  waiting_payment: { label: 'รอรับเงิน', color: 'text-purple-600' },
  closed: { label: 'ปิดแล้ว', color: 'text-green-600' },
};

const EMPTY_FORM = {
  name: '', contact_person: '', phone: '', address: '',
  payment_type: 'on_completion' as Customer['payment_type'],
  credit_days: '', notes: '',
};

export default function CustomersPage() {
  const [supabase] = useState(() => createClient());
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, JobSummary[]>>({});
  const [loadingJobs, setLoadingJobs] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    const [{ data: cuData }, { data: jobData }] = await Promise.all([
      supabase.from('customers').select('*').is('deleted_at', null).order('name'),
      supabase.from('jobs').select('id,customer_id,status,selling_price,payment_type,payment_due_date,date')
        .is('deleted_at', null),
    ]);
    const cuList = cuData || [];
    const jobList = jobData || [];
    const today = new Date().toISOString().slice(0, 10);

    const enriched: CustomerWithStats[] = cuList.map(c => {
      const cjobs = jobList.filter(j => j.customer_id === c.id);
      const overdueAmount = cjobs
        .filter(j => j.status === 'waiting_payment' && j.payment_due_date && j.payment_due_date < today)
        .reduce((s, j) => s + (j.selling_price || 0), 0);
      const waitingAmount = cjobs
        .filter(j => j.status === 'waiting_payment')
        .reduce((s, j) => s + (j.selling_price || 0), 0);
      return {
        ...c,
        jobCount: cjobs.length,
        totalRevenue: cjobs.filter(j => j.status === 'closed').reduce((s, j) => s + (j.selling_price || 0), 0),
        overdueAmount,
        waitingAmount,
      };
    });
    setCustomers(enriched);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const loadJobs = async (customerId: string) => {
    if (expandedJobs[customerId]) return;
    setLoadingJobs(customerId);
    const { data } = await supabase.from('jobs')
      .select('id,date,origin,destination,status,selling_price,payment_type,payment_due_date')
      .eq('customer_id', customerId).is('deleted_at', null)
      .order('date', { ascending: false }).limit(20);
    setExpandedJobs(p => ({ ...p, [customerId]: data || [] }));
    setLoadingJobs(null);
  };

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadJobs(id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, credit_days: form.credit_days ? Number(form.credit_days) : null };
    if (editing) {
      await supabase.from('customers').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert(payload);
    }
    setShowForm(false); setEditing(null); setForm(EMPTY_FORM);
    load();
  };

  const handleEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name, contact_person: c.contact_person || '',
      phone: c.phone || '', address: c.address || '',
      payment_type: c.payment_type,
      credit_days: c.credit_days ? String(c.credit_days) : '',
      notes: c.notes || '',
    });
    setShowForm(true);
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ลูกค้า</h1>
            <p className="text-sm text-slate-500">{customers.length} ราย</p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> เพิ่มลูกค้า
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-slate-800">{customers.length}</div>
          <div className="text-sm text-slate-500 mt-1">ลูกค้าทั้งหมด</div>
        </div>
        <div className="bg-white rounded-xl border border-purple-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-purple-700">
            {formatCurrency(customers.reduce((s, c) => s + c.waitingAmount, 0))}
          </div>
          <div className="text-sm text-slate-500 mt-1">รอรับเงินรวม</div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(customers.reduce((s, c) => s + c.overdueAmount, 0))}
          </div>
          <div className="text-sm text-slate-500 mt-1">เกินกำหนดชำระ</div>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-2">
        {customers.map(c => {
          const isExpanded = expanded === c.id;
          return (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-slate-800">{c.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.payment_type === 'credit' ? 'bg-orange-100 text-orange-700' :
                      c.payment_type === 'prepaid' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {PAYMENT_LABELS[c.payment_type]}
                      {c.payment_type === 'credit' && c.credit_days ? ` ${c.credit_days} วัน` : ''}
                    </span>
                    {c.overdueAmount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> เกินกำหนด {formatCurrency(c.overdueAmount)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
                    {c.contact_person && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.contact_person}</span>}
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{c.phone}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{c.address}</span>}
                  </div>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-slate-500">{c.jobCount} งาน</span>
                    <span className="text-green-700 font-medium">{formatCurrency(c.totalRevenue)} รายได้ปิดแล้ว</span>
                    {c.waitingAmount > 0 && (
                      <span className="text-purple-700 font-medium">{formatCurrency(c.waitingAmount)} รอรับ</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleEdit(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-xs"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    ประวัติ
                  </button>
                </div>
              </div>

              {/* Job History */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  {loadingJobs === c.id ? (
                    <div className="text-center text-slate-400 text-sm py-4">กำลังโหลด...</div>
                  ) : (expandedJobs[c.id] || []).length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-4">ยังไม่มีประวัติงาน</div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">ประวัติงาน 20 รายการล่าสุด</p>
                      {(expandedJobs[c.id] || []).map(j => {
                        const sc = JOB_STATUS_LABELS[j.status] || { label: j.status, color: 'text-slate-500' };
                        const today = new Date().toISOString().slice(0, 10);
                        const isOverdue = j.status === 'waiting_payment' && j.payment_due_date && j.payment_due_date < today;
                        return (
                          <div key={j.id} className={`flex items-center gap-3 bg-white rounded-lg p-3 border ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {new Date(j.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                </span>
                                <span className="font-medium text-sm text-slate-700">
                                  {j.origin} → {j.destination}
                                </span>
                              </div>
                            </div>
                            <span className={`text-xs font-semibold ${sc.color}`}>{sc.label}</span>
                            <span className="text-sm font-bold text-blue-700">{formatCurrency(j.selling_price)}</span>
                            {isOverdue && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div>
                <label className="label-text">ชื่อลูกค้า *</label>
                <input className="form-input" required value={form.name} onChange={e => f('name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">ผู้ติดต่อ</label>
                  <input className="form-input" value={form.contact_person} onChange={e => f('contact_person', e.target.value)} />
                </div>
                <div>
                  <label className="label-text">โทรศัพท์</label>
                  <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label-text">ที่อยู่</label>
                <input className="form-input" value={form.address} onChange={e => f('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">รูปแบบชำระ</label>
                  <select className="form-input" value={form.payment_type} onChange={e => f('payment_type', e.target.value as Customer['payment_type'])}>
                    <option value="prepaid">จ่ายล่วงหน้า</option>
                    <option value="on_completion">จ่ายเมื่อส่ง</option>
                    <option value="credit">เครดิต</option>
                  </select>
                </div>
                {form.payment_type === 'credit' && (
                  <div>
                    <label className="label-text">เครดิต (วัน)</label>
                    <input type="number" className="form-input" value={form.credit_days} onChange={e => f('credit_days', e.target.value)} placeholder="30" />
                  </div>
                )}
              </div>
              <div>
                <label className="label-text">หมายเหตุ</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary">
                  <Check className="w-4 h-4" /> บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
