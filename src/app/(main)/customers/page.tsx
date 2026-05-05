'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Pencil, Phone, MapPin,
  X, Check, AlertCircle, Banknote,
  Tag, ChevronDown, ChevronUp,
  CreditCard, Clock, CheckCircle2, DollarSign,
  Route, Trash2,
} from 'lucide-react';
import type { Customer } from '@/types';
import { formatCurrency } from '@/lib/utils';

type Tab = 'customers' | 'payments' | 'prices';

interface JobSummary {
  id: string; date: string; origin: string; destination: string;
  status: string; selling_price: number; payment_type: string;
  payment_due_date: string | null;
}

interface CustomerWithStats extends Customer {
  jobCount: number; totalRevenue: number;
  overdueAmount: number; waitingAmount: number;
  jobs?: JobSummary[];
}

interface PaymentRow {
  id: string; amount: number; payment_date: string;
  payment_method: string; reference_no: string | null;
  notes: string | null; created_at: string;
  job?: { id: string; origin: string; destination: string; selling_price: number } | null;
  customer?: { id: string; name: string } | null;
}

interface RoutePrice {
  id: string; origin: string; destination: string;
  agreed_price: number; notes: string | null; created_at: string;
  customer_id: string | null;
  customer?: { id: string; name: string } | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  prepaid: 'จ่ายล่วงหน้า', on_completion: 'จ่ายเมื่อส่ง', credit: 'เครดิต',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'โอน', cheque: 'เช็ค', other: 'อื่นๆ',
};

const JOB_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'งานใหม่', color: 'text-slate-500' },
  waiting_driver: { label: 'รอจัดรถ', color: 'text-yellow-600' },
  assigned: { label: 'จัดรถแล้ว', color: 'text-blue-600' },
  in_progress: { label: 'กำลังวิ่ง', color: 'text-orange-600' },
  delivered: { label: 'ส่งแล้ว', color: 'text-teal-600' },
  waiting_payment: { label: 'รอรับเงิน', color: 'text-purple-600' },
  closed: { label: 'ปิดแล้ว', color: 'text-green-600' },
};

const EMPTY_CUST = {
  name: '', contact_person: '', phone: '', address: '',
  payment_type: 'on_completion' as Customer['payment_type'],
  credit_days: '', notes: '',
};

const EMPTY_PAYMENT = {
  customer_id: '', job_id: '', amount: '',
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'transfer', reference_no: '', notes: '',
};

const EMPTY_PRICE = {
  origin: '', destination: '', customer_id: '', agreed_price: '', notes: '',
};

export default function CustomersPage() {
  const [supabase] = useState(() => createClient());
  const [tab, setTab] = useState<Tab>('customers');

  // ── Customers ──
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loadingCust, setLoadingCust] = useState(true);
  const [showCustForm, setShowCustForm] = useState(false);
  const [editingCust, setEditingCust] = useState<Customer | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, JobSummary[]>>({});
  const [custForm, setCustForm] = useState(EMPTY_CUST);

  // ── Payments ──
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadingPay, setLoadingPay] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState(EMPTY_PAYMENT);
  const [waitingJobs, setWaitingJobs] = useState<JobSummary[]>([]);

  // ── Route Prices ──
  const [prices, setPrices] = useState<RoutePrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE);

  // ── Load Customers ──
  const loadCustomers = useCallback(async () => {
    setLoadingCust(true);
    const [{ data: cuData }, { data: jobData }] = await Promise.all([
      supabase.from('customers').select('*').is('deleted_at', null).order('name'),
      supabase.from('jobs').select('id,customer_id,status,selling_price,payment_type,payment_due_date,date')
        .is('deleted_at', null),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const enriched: CustomerWithStats[] = (cuData || []).map(c => {
      const cjobs = (jobData || []).filter(j => j.customer_id === c.id);
      return {
        ...c,
        jobCount: cjobs.length,
        totalRevenue: cjobs.filter(j => j.status === 'closed').reduce((s, j) => s + (j.selling_price || 0), 0),
        overdueAmount: cjobs.filter(j => j.status === 'waiting_payment' && j.payment_due_date && j.payment_due_date < today)
          .reduce((s, j) => s + (j.selling_price || 0), 0),
        waitingAmount: cjobs.filter(j => j.status === 'waiting_payment').reduce((s, j) => s + (j.selling_price || 0), 0),
      };
    });
    setCustomers(enriched);
    setLoadingCust(false);
  }, [supabase]);

  // ── Load Payments ──
  const loadPayments = useCallback(async () => {
    setLoadingPay(true);
    const { data } = await supabase.from('customer_payments')
      .select('*, job:jobs(id,origin,destination,selling_price), customer:customers(id,name)')
      .is('deleted_at', null).order('payment_date', { ascending: false }).limit(100);
    setPayments((data || []) as PaymentRow[]);
    setLoadingPay(false);
  }, [supabase]);

  // ── Load Waiting Jobs ──
  const loadWaitingJobs = useCallback(async () => {
    const { data } = await supabase.from('jobs')
      .select('id,date,origin,destination,status,selling_price,payment_type,payment_due_date')
      .eq('status', 'waiting_payment').is('deleted_at', null).order('date', { ascending: false });
    setWaitingJobs((data || []) as JobSummary[]);
  }, [supabase]);

  // ── Load Route Prices ──
  const loadPrices = useCallback(async () => {
    setLoadingPrices(true);
    const { data } = await supabase.from('route_prices')
      .select('*, customer:customers(id,name)')
      .is('deleted_at', null).order('origin').order('destination');
    setPrices((data || []) as RoutePrice[]);
    setLoadingPrices(false);
  }, [supabase]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  useEffect(() => {
    if (tab === 'payments' && payments.length === 0 && !loadingPay) {
      loadPayments();
      loadWaitingJobs();
    }
    if (tab === 'prices' && prices.length === 0 && !loadingPrices) {
      loadPrices();
    }
  }, [tab]);

  // ── Customer expand ──
  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!expandedJobs[id]) {
      const { data } = await supabase.from('jobs')
        .select('id,date,origin,destination,status,selling_price,payment_type,payment_due_date')
        .eq('customer_id', id).is('deleted_at', null)
        .order('date', { ascending: false }).limit(20);
      setExpandedJobs(p => ({ ...p, [id]: data || [] }));
    }
  };

  // ── Save Customer ──
  const saveCust = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...custForm, credit_days: custForm.credit_days ? Number(custForm.credit_days) : null };
    if (editingCust) {
      await supabase.from('customers').update(payload).eq('id', editingCust.id);
    } else {
      await supabase.from('customers').insert(payload);
    }
    setShowCustForm(false); setEditingCust(null); setCustForm(EMPTY_CUST);
    loadCustomers();
  };

  const handleEditCust = (c: Customer) => {
    setEditingCust(c);
    setCustForm({
      name: c.name, contact_person: c.contact_person || '',
      phone: c.phone || '', address: c.address || '',
      payment_type: c.payment_type,
      credit_days: c.credit_days ? String(c.credit_days) : '',
      notes: c.notes || '',
    });
    setShowCustForm(true);
  };

  // ── Save Payment ──
  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('customer_payments').insert({
      customer_id: payForm.customer_id || null,
      job_id: payForm.job_id || null,
      amount: Number(payForm.amount),
      payment_date: payForm.payment_date,
      payment_method: payForm.payment_method,
      reference_no: payForm.reference_no || null,
      notes: payForm.notes || null,
    });
    // Mark job as closed if full payment
    if (payForm.job_id) {
      await supabase.from('jobs').update({ status: 'closed' }).eq('id', payForm.job_id);
    }
    setShowPayForm(false); setPayForm(EMPTY_PAYMENT);
    loadPayments(); loadWaitingJobs(); loadCustomers();
  };

  // ── Save Route Price ──
  const savePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('route_prices').insert({
      origin: priceForm.origin,
      destination: priceForm.destination,
      customer_id: priceForm.customer_id || null,
      agreed_price: Number(priceForm.agreed_price),
      notes: priceForm.notes || null,
    });
    setShowPriceForm(false); setPriceForm(EMPTY_PRICE);
    loadPrices();
  };

  const deletePrice = async (id: string) => {
    if (!confirm('ลบราคาเส้นทางนี้?')) return;
    await supabase.from('route_prices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    loadPrices();
  };

  const fc = (k: keyof typeof custForm, v: string) => setCustForm(p => ({ ...p, [k]: v }));
  const fp = (k: keyof typeof payForm, v: string) => setPayForm(p => ({ ...p, [k]: v }));
  const fpr = (k: keyof typeof priceForm, v: string) => setPriceForm(p => ({ ...p, [k]: v }));

  const today = new Date().toISOString().slice(0, 10);
  const totalWaiting = customers.reduce((s, c) => s + c.waitingAmount, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdueAmount, 0);
  const totalPaid30 = payments.filter(p => p.payment_date >= new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10))
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
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
        <div className="flex gap-2">
          {tab === 'customers' && (
            <button onClick={() => { setEditingCust(null); setCustForm(EMPTY_CUST); setShowCustForm(true); }}
              className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> เพิ่มลูกค้า
            </button>
          )}
          {tab === 'payments' && (
            <button onClick={() => { setShowPayForm(true); loadWaitingJobs(); }}
              className="btn-primary text-sm">
              <Banknote className="w-4 h-4" /> บันทึกรับเงิน
            </button>
          )}
          {tab === 'prices' && (
            <button onClick={() => setShowPriceForm(true)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> เพิ่มราคาเส้นทาง
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: 'customers', label: 'รายชื่อลูกค้า', icon: Users },
          { key: 'payments',  label: 'การชำระเงิน',   icon: Banknote },
          { key: 'prices',    label: 'ตารางราคา',      icon: Route },
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
            {key === 'payments' && totalOverdue > 0 && (
              <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════
          TAB 1: รายชื่อลูกค้า
      ══════════════════════════════════ */}
      {tab === 'customers' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-slate-800">{customers.length}</div>
              <div className="text-sm text-slate-500">ลูกค้าทั้งหมด</div>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-purple-700">{formatCurrency(totalWaiting)}</div>
              <div className="text-sm text-slate-500">รอรับเงินรวม</div>
            </div>
            <div className={`bg-white rounded-xl border p-4 shadow-sm ${totalOverdue > 0 ? 'border-red-300' : 'border-slate-200'}`}>
              <div className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {formatCurrency(totalOverdue)}
              </div>
              <div className="text-sm text-slate-500">เกินกำหนดชำระ</div>
            </div>
          </div>

          {/* List */}
          {loadingCust ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map(c => {
                const isExp = expanded === c.id;
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
                          <span className="text-slate-400">{c.jobCount} งาน</span>
                          <span className="text-green-700 font-medium">{formatCurrency(c.totalRevenue)} ปิดแล้ว</span>
                          {c.waitingAmount > 0 && (
                            <span className="text-purple-700 font-medium">{formatCurrency(c.waitingAmount)} รอรับ</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleEditCust(c)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleExpand(c.id)}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                          {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isExp && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        {!expandedJobs[c.id] ? (
                          <div className="text-center text-slate-400 text-sm py-3">กำลังโหลด...</div>
                        ) : expandedJobs[c.id].length === 0 ? (
                          <div className="text-center text-slate-400 text-sm py-3">ยังไม่มีประวัติงาน</div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">ประวัติงาน 20 ล่าสุด</p>
                            {expandedJobs[c.id].map(j => {
                              const sc = JOB_STATUS[j.status] || { label: j.status, color: 'text-slate-500' };
                              const isOD = j.status === 'waiting_payment' && j.payment_due_date && j.payment_due_date < today;
                              return (
                                <div key={j.id} className={`flex items-center gap-3 bg-white rounded-lg px-3 py-2 border ${isOD ? 'border-red-200' : 'border-slate-200'}`}>
                                  <span className="text-xs text-slate-400 w-16 flex-shrink-0">
                                    {new Date(j.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                  </span>
                                  <span className="flex-1 text-sm text-slate-700">{j.origin} → {j.destination}</span>
                                  <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                                  <span className="text-sm font-bold text-blue-700 w-20 text-right">{formatCurrency(j.selling_price)}</span>
                                  {isOD && <AlertCircle className="w-4 h-4 text-red-500" />}
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
          )}
        </>
      )}

      {/* ══════════════════════════════════
          TAB 2: การชำระเงิน
      ══════════════════════════════════ */}
      {tab === 'payments' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`bg-white rounded-xl border p-4 shadow-sm ${totalOverdue > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className={`w-4 h-4 ${totalOverdue > 0 ? 'text-red-500' : 'text-slate-300'}`} />
                <span className="text-xs font-semibold text-slate-500 uppercase">เกินกำหนด</span>
              </div>
              <div className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {formatCurrency(totalOverdue)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {customers.filter(c => c.overdueAmount > 0).length} ลูกค้า
              </div>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase">รอรับเงิน</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">{formatCurrency(totalWaiting)}</div>
              <div className="text-xs text-slate-400 mt-0.5">{waitingJobs.length} งาน</div>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase">รับแล้ว 30 วัน</span>
              </div>
              <div className="text-2xl font-bold text-green-700">{formatCurrency(totalPaid30)}</div>
              <div className="text-xs text-slate-400 mt-0.5">{payments.filter(p => p.payment_date >= new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10)).length} รายการ</div>
            </div>
          </div>

          {/* Waiting Jobs */}
          {waitingJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" /> งานรอรับเงิน ({waitingJobs.length})
              </h3>
              <div className="space-y-1.5">
                {waitingJobs.map(j => {
                  const isOD = j.payment_due_date && j.payment_due_date < today;
                  return (
                    <div key={j.id} className={`flex items-center gap-4 bg-white rounded-xl border px-4 py-3 shadow-sm ${isOD ? 'border-red-300' : 'border-slate-200'}`}>
                      <div className="flex-1">
                        <div className="font-medium text-slate-800 text-sm">{j.origin} → {j.destination}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(j.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                          {j.payment_due_date && (
                            <span className={`ml-2 ${isOD ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                              · ครบ {new Date(j.payment_due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                              {isOD && ' ⚠️ เกินกำหนด'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-800">{formatCurrency(j.selling_price)}</div>
                        <div className="text-xs text-slate-400">{PAYMENT_LABELS[j.payment_type]}</div>
                      </div>
                      <button
                        onClick={() => {
                          setPayForm({ ...EMPTY_PAYMENT, job_id: j.id, amount: String(j.selling_price) });
                          setShowPayForm(true);
                        }}
                        className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
                        <Banknote className="w-3.5 h-3.5" /> รับเงิน
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment History */}
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> ประวัติรับเงิน
            </h3>
            {loadingPay ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
            ) : payments.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
                ยังไม่มีประวัติการรับเงิน
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">วันที่</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">ลูกค้า / งาน</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">วิธีชำระ</th>
                      <th className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                          {new Date(p.payment_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800">{p.customer?.name || '—'}</div>
                          {p.job && (
                            <div className="text-xs text-slate-400">{p.job.origin} → {p.job.destination}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {METHOD_LABELS[p.payment_method] || p.payment_method}
                          </span>
                          {p.reference_no && <div className="text-xs text-slate-400 mt-0.5">{p.reference_no}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-green-700">{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════
          TAB 3: ตารางราคา
      ══════════════════════════════════ */}
      {tab === 'prices' && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
            <Tag className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>ราคาที่บันทึกไว้จะถูก autofill อัตโนมัติเมื่อเลือก origin → destination เดิมในหน้า &quot;งานเข้า&quot;</span>
          </div>

          {loadingPrices ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
          ) : prices.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Route className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">ยังไม่มีราคาเส้นทาง</p>
              <p className="text-sm mt-1">กดปุ่ม &quot;เพิ่มราคาเส้นทาง&quot; เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">เส้นทาง</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">ลูกค้า</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs">ราคาตกลง</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prices.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 group">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{p.origin} → {p.destination}</div>
                        {p.notes && <div className="text-xs text-slate-400 mt-0.5">{p.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-sm">
                        {p.customer?.name || <span className="text-slate-300 italic">ทุกลูกค้า</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(p.agreed_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deletePrice(p.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 rounded transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════ Modals ══════ */}

      {/* Customer Form */}
      {showCustForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCustForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editingCust ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h2>
              <button onClick={() => setShowCustForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveCust} className="p-5 space-y-3">
              <div>
                <label className="form-label">ชื่อลูกค้า *</label>
                <input className="form-input" required value={custForm.name} onChange={e => fc('name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">ผู้ติดต่อ</label>
                  <input className="form-input" value={custForm.contact_person} onChange={e => fc('contact_person', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">โทรศัพท์</label>
                  <input className="form-input" value={custForm.phone} onChange={e => fc('phone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">ที่อยู่</label>
                <input className="form-input" value={custForm.address} onChange={e => fc('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">รูปแบบชำระ</label>
                  <select className="form-input" value={custForm.payment_type} onChange={e => fc('payment_type', e.target.value as Customer['payment_type'])}>
                    <option value="prepaid">จ่ายล่วงหน้า</option>
                    <option value="on_completion">จ่ายเมื่อส่ง</option>
                    <option value="credit">เครดิต</option>
                  </select>
                </div>
                {custForm.payment_type === 'credit' && (
                  <div>
                    <label className="form-label">เครดิต (วัน)</label>
                    <input type="number" className="form-input" value={custForm.credit_days} onChange={e => fc('credit_days', e.target.value)} placeholder="30" />
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <textarea className="form-input" rows={2} value={custForm.notes} onChange={e => fc('notes', e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCustForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary"><Check className="w-4 h-4" /> บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Form */}
      {showPayForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPayForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">บันทึกรับเงิน</h2>
              <button onClick={() => setShowPayForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={savePayment} className="p-5 space-y-3">
              <div>
                <label className="form-label">งาน (รอรับเงิน)</label>
                <select className="form-input" value={payForm.job_id} onChange={e => {
                  const job = waitingJobs.find(j => j.id === e.target.value);
                  setPayForm(p => ({ ...p, job_id: e.target.value, amount: job ? String(job.selling_price) : p.amount }));
                }}>
                  <option value="">— เลือกงาน (ถ้ามี) —</option>
                  {waitingJobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.origin} → {j.destination} · {formatCurrency(j.selling_price)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">ลูกค้า</label>
                <select className="form-input" value={payForm.customer_id} onChange={e => fp('customer_id', e.target.value)}>
                  <option value="">— เลือกลูกค้า —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">จำนวนเงิน (บาท) *</label>
                  <input type="number" className="form-input" required value={payForm.amount}
                    onChange={e => fp('amount', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">วันที่รับเงิน</label>
                  <input type="date" className="form-input" value={payForm.payment_date}
                    onChange={e => fp('payment_date', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">วิธีชำระ</label>
                  <select className="form-input" value={payForm.payment_method} onChange={e => fp('payment_method', e.target.value)}>
                    <option value="cash">เงินสด</option>
                    <option value="transfer">โอนเงิน</option>
                    <option value="cheque">เช็ค</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">เลขที่อ้างอิง</label>
                  <input className="form-input" value={payForm.reference_no}
                    onChange={e => fp('reference_no', e.target.value)} placeholder="เลขโอน/เช็ค" />
                </div>
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="form-input" value={payForm.notes} onChange={e => fp('notes', e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowPayForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary"><Banknote className="w-4 h-4" /> บันทึกรับเงิน</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Route Price Form */}
      {showPriceForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPriceForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">เพิ่มราคาเส้นทาง</h2>
              <button onClick={() => setShowPriceForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={savePrice} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">จากจังหวัด *</label>
                  <input className="form-input" required value={priceForm.origin}
                    onChange={e => fpr('origin', e.target.value)} placeholder="นครสวรรค์" />
                </div>
                <div>
                  <label className="form-label">ถึงจังหวัด *</label>
                  <input className="form-input" required value={priceForm.destination}
                    onChange={e => fpr('destination', e.target.value)} placeholder="กรุงเทพ" />
                </div>
              </div>
              <div>
                <label className="form-label">ลูกค้า <span className="text-slate-400 font-normal">(ถ้าว่างคือราคาทั่วไป)</span></label>
                <select className="form-input" value={priceForm.customer_id} onChange={e => fpr('customer_id', e.target.value)}>
                  <option value="">— ทุกลูกค้า —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ราคาตกลง (บาท) *</label>
                <input type="number" className="form-input" required value={priceForm.agreed_price}
                  onChange={e => fpr('agreed_price', e.target.value)} placeholder="15000" />
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="form-input" value={priceForm.notes}
                  onChange={e => fpr('notes', e.target.value)} placeholder="รถ 10 ล้อ" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowPriceForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary"><Check className="w-4 h-4" /> บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
