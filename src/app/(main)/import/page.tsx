'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Ship, Plus, X, Check, RefreshCw,
  TrendingUp, TrendingDown, Package,
  Truck, ChevronDown, ChevronUp, Pencil,
  Globe, MapPin, Scale, DollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type LotStatus = 'pending' | 'in_transit' | 'arrived' | 'delivered' | 'closed';

interface ImportLot {
  id: string;
  lot_number: string;
  product_type: string;
  origin_country: string;
  border_crossing: string | null;
  supplier: string | null;
  weight_tons: number;
  cost_per_ton: number;
  total_cost: number;
  selling_price_per_ton: number;
  total_revenue: number;
  gross_profit: number;
  status: LotStatus;
  assigned_job_id: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<LotStatus, { label: string; bg: string; color: string }> = {
  pending:    { label: 'รอดำเนินการ', bg: 'bg-slate-100',   color: 'text-slate-600' },
  in_transit: { label: 'กำลังขนส่ง',  bg: 'bg-blue-100',    color: 'text-blue-700'  },
  arrived:    { label: 'ถึงแล้ว',      bg: 'bg-teal-100',    color: 'text-teal-700'  },
  delivered:  { label: 'ส่งมอบแล้ว',  bg: 'bg-indigo-100',  color: 'text-indigo-700'},
  closed:     { label: 'ปิดล็อต',     bg: 'bg-green-100',   color: 'text-green-700' },
};

const PRODUCT_TYPES = ['ข้าวโพด', 'มันสำปะหลัง', 'ข้าว', 'อ้อย', 'ยางพารา', 'อื่นๆ'];
const ORIGIN_COUNTRIES = ['เมียนมา', 'ลาว', 'กัมพูชา', 'เวียดนาม', 'จีน'];
const BORDER_CROSSINGS = ['แม่สอด', 'มุกดาหาร', 'หนองคาย', 'อรัญประเทศ', 'แม่สาย', 'บ้านผักกาด'];

const EMPTY_FORM = {
  lot_number: '', product_type: 'ข้าวโพด', origin_country: 'เมียนมา',
  border_crossing: '', supplier: '', weight_tons: '',
  cost_per_ton: '', selling_price_per_ton: '',
  arrival_date: '', delivery_date: '', notes: '', status: 'pending' as LotStatus,
};

export default function ImportPage() {
  const [supabase] = useState(() => createClient());
  const [lots, setLots] = useState<ImportLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ImportLot | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState<LotStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('import_lots')
      .select('*').is('deleted_at', null)
      .order('created_at', { ascending: false });
    setLots((data || []) as ImportLot[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      lot_number: form.lot_number,
      product_type: form.product_type,
      origin_country: form.origin_country,
      border_crossing: form.border_crossing || null,
      supplier: form.supplier || null,
      weight_tons: Number(form.weight_tons),
      cost_per_ton: Number(form.cost_per_ton),
      selling_price_per_ton: Number(form.selling_price_per_ton),
      arrival_date: form.arrival_date || null,
      delivery_date: form.delivery_date || null,
      notes: form.notes || null,
      status: form.status,
    };
    if (editing) {
      await supabase.from('import_lots').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('import_lots').insert(payload);
    }
    setShowForm(false); setEditing(null); setForm(EMPTY_FORM);
    load();
  };

  const handleEdit = (lot: ImportLot) => {
    setEditing(lot);
    setForm({
      lot_number: lot.lot_number,
      product_type: lot.product_type,
      origin_country: lot.origin_country,
      border_crossing: lot.border_crossing || '',
      supplier: lot.supplier || '',
      weight_tons: String(lot.weight_tons),
      cost_per_ton: String(lot.cost_per_ton),
      selling_price_per_ton: String(lot.selling_price_per_ton),
      arrival_date: lot.arrival_date || '',
      delivery_date: lot.delivery_date || '',
      notes: lot.notes || '',
      status: lot.status,
    });
    setShowForm(true);
  };

  const updateStatus = async (id: string, status: LotStatus) => {
    await supabase.from('import_lots').update({ status }).eq('id', id);
    load();
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const filtered = filterStatus === 'all' ? lots : lots.filter(l => l.status === filterStatus);

  // KPIs
  const activeLots = lots.filter(l => l.status !== 'closed');
  const totalRevenue = lots.reduce((s, l) => s + (l.total_revenue || 0), 0);
  const totalCost    = lots.reduce((s, l) => s + (l.total_cost    || 0), 0);
  const totalProfit  = lots.reduce((s, l) => s + (l.gross_profit  || 0), 0);
  const totalWeight  = activeLots.reduce((s, l) => s + l.weight_tons, 0);

  // Preview profit in form
  const previewWeight = Number(form.weight_tons) || 0;
  const previewCost   = Number(form.cost_per_ton) || 0;
  const previewSell   = Number(form.selling_price_per_ton) || 0;
  const previewProfit = (previewSell - previewCost) * previewWeight;

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
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
            <Ship className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ชิปปิ้งนำเข้า</h1>
            <p className="text-sm text-slate-500">ล็อตสินค้าจากต่างประเทศ · {activeLots.length} ล็อตดำเนินการอยู่</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); }}
            className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> สร้างล็อตใหม่
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-violet-600 font-semibold uppercase mb-1">ล็อตดำเนินการ</div>
          <div className="text-2xl font-bold text-violet-800">{activeLots.length} ล็อต</div>
          <div className="text-xs text-violet-500 mt-0.5">{totalWeight.toLocaleString('th-TH')} ตัน รวม</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold uppercase mb-1">รายได้รวม</div>
          <div className="text-xl font-bold text-slate-800">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold uppercase mb-1">ต้นทุนรวม</div>
          <div className="text-xl font-bold text-slate-800">{formatCurrency(totalCost)}</div>
        </div>
        <div className={`rounded-xl p-4 shadow-sm border ${totalProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-xs font-semibold uppercase mb-1 ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>กำไรรวม</div>
          <div className={`text-xl font-bold flex items-center gap-1 ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {totalProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {formatCurrency(Math.abs(totalProfit))}
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {([['all', 'ทั้งหมด'], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setFilterStatus(key as LotStatus | 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === key ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'
            }`}>
            {label}
            {key !== 'all' && <span className="ml-1 opacity-70">({lots.filter(l => l.status === key).length})</span>}
          </button>
        ))}
      </div>

      {/* Lot List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">ยังไม่มีล็อตสินค้า</p>
          <p className="text-sm mt-1">กดปุ่ม &quot;สร้างล็อตใหม่&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lot => {
            const cfg = STATUS_CONFIG[lot.status];
            const isExp = expanded === lot.id;
            const marginPct = lot.total_revenue > 0
              ? Math.round((lot.gross_profit / lot.total_revenue) * 100) : 0;

            return (
              <div key={lot.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-violet-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">{lot.lot_number}</span>
                      <span className="text-slate-500 text-sm">{lot.product_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{lot.origin_country}</span>
                      {lot.border_crossing && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{lot.border_crossing}</span>}
                      <span className="flex items-center gap-1"><Scale className="w-3.5 h-3.5" />{lot.weight_tons.toLocaleString('th-TH')} ตัน</span>
                    </div>
                  </div>

                  {/* P&L */}
                  <div className="text-right flex-shrink-0">
                    <div className={`text-lg font-bold ${lot.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {lot.gross_profit >= 0 ? '+' : ''}{formatCurrency(lot.gross_profit)}
                    </div>
                    <div className="text-xs text-slate-400">
                      margin {marginPct}% · {formatCurrency(lot.total_revenue)} รายได้
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleEdit(lot)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setExpanded(isExp ? null : lot.id)}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                      {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <div className="text-xs text-slate-400 mb-1">ต้นทุน/ตัน</div>
                        <div className="font-bold text-slate-800">{formatCurrency(lot.cost_per_ton)}</div>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <div className="text-xs text-slate-400 mb-1">ราคาขาย/ตัน</div>
                        <div className="font-bold text-blue-700">{formatCurrency(lot.selling_price_per_ton)}</div>
                      </div>
                      <div className={`rounded-xl border p-3 text-center ${lot.gross_profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="text-xs text-slate-400 mb-1">กำไร/ตัน</div>
                        <div className={`font-bold ${lot.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCurrency(lot.selling_price_per_ton - lot.cost_per_ton)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                      {lot.supplier && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">ผู้ขาย</span>
                          <span className="font-medium text-slate-700">{lot.supplier}</span>
                        </div>
                      )}
                      {lot.arrival_date && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">วันถึงไทย</span>
                          <span className="font-medium text-slate-700">{new Date(lot.arrival_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        </div>
                      )}
                      {lot.delivery_date && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">วันส่งมอบ</span>
                          <span className="font-medium text-slate-700">{new Date(lot.delivery_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        </div>
                      )}
                      {lot.notes && (
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">หมายเหตุ</span>
                          <span className="text-slate-600">{lot.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Status Progression */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">อัปเดตสถานะ</p>
                      <div className="flex gap-2 flex-wrap">
                        {(Object.entries(STATUS_CONFIG) as [LotStatus, typeof STATUS_CONFIG[LotStatus]][]).map(([key, cfg]) => (
                          <button key={key}
                            onClick={() => updateStatus(lot.id, key)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                              lot.status === key
                                ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-violet-400`
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-violet-300'
                            }`}>
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-800">{editing ? 'แก้ไขล็อต' : 'สร้างล็อตใหม่'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">เลขล็อต *</label>
                  <input className="form-input" required value={form.lot_number}
                    onChange={e => f('lot_number', e.target.value)} placeholder="LOT-2025-001" />
                </div>
                <div>
                  <label className="form-label">ประเภทสินค้า *</label>
                  <select className="form-input" value={form.product_type} onChange={e => f('product_type', e.target.value)}>
                    {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">ประเทศต้นทาง</label>
                  <select className="form-input" value={form.origin_country} onChange={e => f('origin_country', e.target.value)}>
                    {ORIGIN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">ด่านชายแดน</label>
                  <select className="form-input" value={form.border_crossing} onChange={e => f('border_crossing', e.target.value)}>
                    <option value="">— เลือกด่าน —</option>
                    {BORDER_CROSSINGS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">ผู้ขาย / ซัพพลายเออร์</label>
                <input className="form-input" value={form.supplier}
                  onChange={e => f('supplier', e.target.value)} placeholder="ชื่อบริษัทหรือชื่อบุคคล" />
              </div>

              <div>
                <label className="form-label text-slate-600 text-xs font-semibold uppercase tracking-wide mb-2 block">ราคาและน้ำหนัก</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="form-label">น้ำหนัก (ตัน) *</label>
                    <input type="number" step="0.001" className="form-input" required
                      value={form.weight_tons} onChange={e => f('weight_tons', e.target.value)} placeholder="500" />
                  </div>
                  <div>
                    <label className="form-label">ต้นทุน/ตัน (฿) *</label>
                    <input type="number" className="form-input" required
                      value={form.cost_per_ton} onChange={e => f('cost_per_ton', e.target.value)} placeholder="4500" />
                  </div>
                  <div>
                    <label className="form-label">ราคาขาย/ตัน (฿) *</label>
                    <input type="number" className="form-input" required
                      value={form.selling_price_per_ton} onChange={e => f('selling_price_per_ton', e.target.value)} placeholder="5200" />
                  </div>
                </div>

                {/* Profit Preview */}
                {previewWeight > 0 && previewCost > 0 && previewSell > 0 && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-sm flex items-center justify-between ${previewProfit >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                    <span className="text-slate-600">กำไรประมาณ</span>
                    <span className={`font-bold ${previewProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {previewProfit >= 0 ? '+' : ''}{formatCurrency(previewProfit)}
                      <span className="text-xs font-normal ml-1">
                        ({previewSell > 0 ? Math.round((previewProfit / (previewSell * previewWeight)) * 100) : 0}% margin)
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">วันที่ถึงไทย</label>
                  <input type="date" className="form-input" value={form.arrival_date}
                    onChange={e => f('arrival_date', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">วันส่งมอบ</label>
                  <input type="date" className="form-input" value={form.delivery_date}
                    onChange={e => f('delivery_date', e.target.value)} />
                </div>
              </div>

              <div>
                <label className="form-label">สถานะ</label>
                <select className="form-input" value={form.status} onChange={e => f('status', e.target.value as LotStatus)}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">หมายเหตุ</label>
                <textarea className="form-input" rows={2} value={form.notes}
                  onChange={e => f('notes', e.target.value)} />
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary"><Check className="w-4 h-4" /> บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
