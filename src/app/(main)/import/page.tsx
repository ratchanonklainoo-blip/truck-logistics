'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Ship, Plus, X, Check, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Package, DollarSign, TrendingUp, TrendingDown, FileText, Users,
  AlertCircle, CheckCircle2, Clock, Truck, BarChart3, Boxes,
  Globe, MapPin, Building2, Phone, Mail, CreditCard, Edit2,
  Upload, Download, Archive, Layers,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
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
  status: 'pending' | 'in_transit' | 'arrived' | 'delivered' | 'closed';
  arrival_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
}

interface Supplier {
  id: string;
  name: string;
  country: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
}

interface DocumentItem {
  id: string;
  lot_id: string;
  doc_type: string;
  doc_name: string;
  status: 'pending' | 'received' | 'verified';
  received_date: string | null;
  notes: string | null;
}

interface StockItem {
  product_type: string;
  total_weight: number;
  sold_weight: number;
  remaining_weight: number;
  avg_cost: number;
  avg_sell: number;
  lot_count: number;
}

// ── Constants ─────────────────────────────────────────────────
const PRODUCT_TYPES = ['ข้าวโพด', 'มันสำปะหลัง', 'ข้าว', 'อ้อย', 'ยางพารา', 'ถั่วเหลือง', 'อื่นๆ'];
const BORDER_CROSSINGS = ['แม่สอด', 'มุกดาหาร', 'หนองคาย', 'อรัญประเทศ', 'แม่สาย', 'บ้านผักกาด', 'ด่านอื่นๆ'];
const COUNTRIES = ['เมียนมา', 'ลาว', 'กัมพูชา', 'เวียดนาม', 'จีน', 'อินเดีย'];

const LOT_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:    { label: 'รอดำเนินการ', color: 'text-slate-600',  bg: 'bg-slate-100',   icon: <Clock className="w-3.5 h-3.5" /> },
  in_transit: { label: 'อยู่ระหว่างขนส่ง', color: 'text-blue-700', bg: 'bg-blue-100', icon: <Truck className="w-3.5 h-3.5" /> },
  arrived:    { label: 'ถึงด่านแล้ว',  color: 'text-orange-700', bg: 'bg-orange-100', icon: <MapPin className="w-3.5 h-3.5" /> },
  delivered:  { label: 'ส่งลูกค้าแล้ว', color: 'text-teal-700',  bg: 'bg-teal-100',   icon: <Check className="w-3.5 h-3.5" /> },
  closed:     { label: 'ปิดงานแล้ว',  color: 'text-green-700', bg: 'bg-green-100',   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const REQUIRED_DOCS = [
  'Invoice',
  'Packing List',
  'Certificate of Origin',
  'Phytosanitary Certificate',
  'Bill of Lading / ใบขนส่ง',
  'ใบขนสินค้าขาเข้า (ศุลกากร)',
  'ใบอนุญาตนำเข้า',
  'ผลตรวจสอบคุณภาพ',
];

const DOC_STATUS_CONFIG = {
  pending:  { label: 'ยังไม่มี',   color: 'text-slate-400',  bg: 'bg-slate-50',   dot: 'bg-slate-300' },
  received: { label: 'รับแล้ว',    color: 'text-blue-600',   bg: 'bg-blue-50',    dot: 'bg-blue-400' },
  verified: { label: 'ยืนยันแล้ว', color: 'text-green-600',  bg: 'bg-green-50',   dot: 'bg-green-500' },
};

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatWeight(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ── Main Component ────────────────────────────────────────────
export default function ShippingPage() {
  const [supabase] = useState(() => createClient());
  const [activeTab, setActiveTab] = useState<'lots' | 'docs' | 'suppliers' | 'stock'>('lots');
  const [lots, setLots] = useState<ImportLot[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedLot, setExpandedLot] = useState<string | null>(null);
  const [showLotForm, setShowLotForm] = useState(false);
  const [editLot, setEditLot] = useState<ImportLot | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: lotsData }, { data: suppliersData }] = await Promise.all([
      supabase.from('import_lots').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('shipping_suppliers').select('*').is('deleted_at', null).order('name'),
    ]);
    setLots((lotsData || []) as ImportLot[]);
    setSuppliers((suppliersData || []) as Supplier[]);

    // Load documents if needed
    if (lotsData && lotsData.length > 0) {
      const lotIds = lotsData.map((l: ImportLot) => l.id);
      const { data: docsData } = await supabase
        .from('shipping_documents').select('*')
        .in('lot_id', lotIds).order('doc_type');
      setDocuments((docsData || []) as DocumentItem[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPI Summary
  const kpis = useMemo(() => {
    const active = lots.filter(l => l.status !== 'closed');
    const closed = lots.filter(l => l.status === 'closed');
    return {
      activeLots: active.length,
      activeWeight: active.reduce((s, l) => s + l.weight_tons, 0),
      totalRevenue: closed.reduce((s, l) => s + l.total_revenue, 0),
      totalCost: closed.reduce((s, l) => s + l.total_cost, 0),
      totalProfit: closed.reduce((s, l) => s + l.gross_profit, 0),
      inTransit: lots.filter(l => l.status === 'in_transit').length,
      arrived: lots.filter(l => l.status === 'arrived').length,
      pendingDocs: documents.filter(d => d.status === 'pending').length,
    };
  }, [lots, documents]);

  // Stock aggregation
  const stockItems = useMemo<StockItem[]>(() => {
    const map: Record<string, StockItem> = {};
    lots.filter(l => ['arrived', 'delivered', 'closed'].includes(l.status)).forEach(l => {
      if (!map[l.product_type]) {
        map[l.product_type] = {
          product_type: l.product_type,
          total_weight: 0, sold_weight: 0, remaining_weight: 0,
          avg_cost: 0, avg_sell: 0, lot_count: 0,
        };
      }
      const s = map[l.product_type];
      s.total_weight += l.weight_tons;
      s.sold_weight += l.status === 'closed' ? l.weight_tons : 0;
      s.remaining_weight = s.total_weight - s.sold_weight;
      s.avg_cost = (s.avg_cost * s.lot_count + l.cost_per_ton) / (s.lot_count + 1);
      s.avg_sell = (s.avg_sell * s.lot_count + l.selling_price_per_ton) / (s.lot_count + 1);
      s.lot_count++;
    });
    return Object.values(map);
  }, [lots]);

  const filteredLots = useMemo(() => {
    if (filterStatus === 'all') return lots;
    return lots.filter(l => l.status === filterStatus);
  }, [lots, filterStatus]);

  const advanceLotStatus = async (lot: ImportLot) => {
    const next: Record<string, string> = {
      pending: 'in_transit', in_transit: 'arrived',
      arrived: 'delivered', delivered: 'closed',
    };
    const nextStatus = next[lot.status];
    if (!nextStatus) return;
    await supabase.from('import_lots').update({ status: nextStatus }).eq('id', lot.id);
    loadData();
  };

  const deleteLot = async (id: string) => {
    if (!confirm('ลบล็อตนี้?')) return;
    await supabase.from('import_lots').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    loadData();
  };

  const updateDocStatus = async (docId: string, status: string) => {
    await supabase.from('shipping_documents').update({
      status,
      received_date: status !== 'pending' ? new Date().toISOString().slice(0, 10) : null,
    }).eq('id', docId);
    loadData();
  };

  const ensureLotDocs = async (lotId: string) => {
    const existing = documents.filter(d => d.lot_id === lotId).map(d => d.doc_type);
    const missing = REQUIRED_DOCS.filter(d => !existing.includes(d));
    if (missing.length === 0) return;
    await supabase.from('shipping_documents').insert(
      missing.map(doc => ({ lot_id: lotId, doc_type: doc, doc_name: doc, status: 'pending' }))
    );
    loadData();
  };

  const TABS = [
    { key: 'lots',      label: 'ล็อตสินค้า',   icon: <Package className="w-4 h-4" />, badge: lots.filter(l => l.status !== 'closed').length },
    { key: 'docs',      label: 'เอกสาร',        icon: <FileText className="w-4 h-4" />, badge: kpis.pendingDocs > 0 ? kpis.pendingDocs : null },
    { key: 'suppliers', label: 'ผู้ขาย',        icon: <Users className="w-4 h-4" />, badge: null },
    { key: 'stock',     label: 'สต็อกสินค้า',  icon: <Boxes className="w-4 h-4" />, badge: null },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Ship className="w-6 h-6 text-blue-600" /> ชิปปิ้ง
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">ระบบนำเข้าสินค้าเกษตรจากต่างประเทศ</p>
        </div>
        <button onClick={loadData} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'ล็อตที่ยังเปิดอยู่', value: kpis.activeLots, sub: `${formatWeight(kpis.activeWeight)} ตัน`, icon: <Package className="w-5 h-5" />, color: 'border-blue-500 bg-blue-50 text-blue-700' },
          { label: 'ระหว่างขนส่ง',      value: kpis.inTransit,   sub: `${kpis.arrived} ล็อตถึงด่านแล้ว`, icon: <Truck className="w-5 h-5" />, color: 'border-orange-500 bg-orange-50 text-orange-700' },
          { label: 'รายได้รวม (ปิดแล้ว)', value: `฿${formatCurrency(kpis.totalRevenue)}`, sub: `ต้นทุน ฿${formatCurrency(kpis.totalCost)}`, icon: <DollarSign className="w-5 h-5" />, color: 'border-green-500 bg-green-50 text-green-700' },
          { label: 'กำไรรวม',            value: `฿${formatCurrency(kpis.totalProfit)}`, sub: kpis.totalRevenue > 0 ? `margin ${((kpis.totalProfit/kpis.totalRevenue)*100).toFixed(1)}%` : '—', icon: kpis.totalProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />, color: kpis.totalProfit >= 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-500 bg-red-50 text-red-700' },
        ].map(({ label, value, sub, icon, color }) => (
          <div key={label} className={`rounded-xl border-l-4 p-4 shadow-sm ${color}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold opacity-70">{label}</p>
              <div className="opacity-50">{icon}</div>
            </div>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs opacity-60 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex border-b border-slate-100 px-2 pt-2 gap-1">
          {TABS.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {tab.icon} {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ── Tab: ล็อตสินค้า ── */}
          {activeTab === 'lots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Status Filter */}
                <div className="flex gap-1.5 flex-wrap">
                  {[{ v: 'all', l: 'ทั้งหมด' }, ...Object.entries(LOT_STATUS).map(([v, c]) => ({ v, l: c.label }))].map(({ v, l }) => (
                    <button key={v} onClick={() => setFilterStatus(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filterStatus === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>{l}</button>
                  ))}
                </div>
                <button onClick={() => { setEditLot(null); setShowLotForm(true); }}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  <Plus className="w-4 h-4" /> เพิ่มล็อตใหม่
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mr-2" /> กำลังโหลด...
                </div>
              ) : filteredLots.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Ship className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>ยังไม่มีล็อตสินค้า</p>
                  <p className="text-xs mt-1">กดปุ่ม &ldquo;เพิ่มล็อตใหม่&rdquo; เพื่อเริ่มต้น</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLots.map(lot => {
                    const st = LOT_STATUS[lot.status];
                    const margin = lot.total_revenue > 0 ? (lot.gross_profit / lot.total_revenue) * 100 : 0;
                    const isExpanded = expandedLot === lot.id;
                    const lotDocs = documents.filter(d => d.lot_id === lot.id);
                    const docsReady = lotDocs.filter(d => d.status === 'verified').length;
                    const hasNextStatus = lot.status !== 'closed';

                    return (
                      <div key={lot.id} className="border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                        {/* Lot Card Header */}
                        <div className="p-4 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <button onClick={() => setExpandedLot(isExpanded ? null : lot.id)}
                                className="mt-0.5 text-slate-400 hover:text-slate-600 flex-shrink-0">
                                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-800">{lot.lot_number}</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                                    {st.icon} {st.label}
                                  </span>
                                  <span className="text-xs text-slate-400">{lot.product_type}</span>
                                </div>
                                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                  <span className="text-sm text-slate-500 flex items-center gap-1">
                                    <Globe className="w-3.5 h-3.5" /> {lot.origin_country}
                                    {lot.border_crossing && ` → ${lot.border_crossing}`}
                                  </span>
                                  <span className="text-sm text-slate-500">{formatWeight(lot.weight_tons)} ตัน</span>
                                  {lot.supplier && <span className="text-sm text-slate-500">{lot.supplier}</span>}
                                  {lotDocs.length > 0 && (
                                    <span className={`text-xs ${docsReady === lotDocs.length ? 'text-green-600' : 'text-orange-600'}`}>
                                      เอกสาร {docsReady}/{lotDocs.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* P&L Summary */}
                            <div className="text-right flex-shrink-0">
                              <div className={`text-sm font-bold ${lot.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {lot.gross_profit >= 0 ? '+' : ''}฿{formatCurrency(lot.gross_profit)}
                              </div>
                              <div className="text-xs text-slate-400">margin {margin.toFixed(1)}%</div>
                            </div>
                          </div>

                          {/* Quick P&L bar */}
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'รายได้', value: lot.total_revenue, color: 'text-blue-600' },
                              { label: 'ต้นทุน', value: lot.total_cost,    color: 'text-red-500' },
                              { label: 'กำไร',  value: lot.gross_profit,   color: lot.gross_profit >= 0 ? 'text-green-600' : 'text-red-600' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-slate-50 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400">{label}</div>
                                <div className={`text-sm font-semibold ${color}`}>฿{formatCurrency(value)}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Expanded Detail */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                            {/* Per-ton breakdown */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ราคาต่อตัน</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                  { label: 'ต้นทุน/ตัน', value: `฿${formatCurrency(lot.cost_per_ton)}` },
                                  { label: 'ขาย/ตัน', value: `฿${formatCurrency(lot.selling_price_per_ton)}` },
                                  { label: 'กำไร/ตัน', value: `฿${formatCurrency(lot.selling_price_per_ton - lot.cost_per_ton)}` },
                                  { label: 'น้ำหนัก', value: `${formatWeight(lot.weight_tons)} ตัน` },
                                ].map(({ label, value }) => (
                                  <div key={label} className="bg-white rounded-lg p-2.5 text-center border border-slate-200">
                                    <div className="text-[10px] text-slate-400">{label}</div>
                                    <div className="text-sm font-semibold text-slate-700 mt-0.5">{value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-slate-400">วันที่ถึง</p>
                                <p className="text-sm font-medium text-slate-700">{formatDate(lot.arrival_date)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400">วันส่งลูกค้า</p>
                                <p className="text-sm font-medium text-slate-700">{formatDate(lot.delivery_date)}</p>
                              </div>
                            </div>

                            {lot.notes && (
                              <p className="text-xs text-slate-500 bg-white rounded-lg p-2.5 border border-slate-200">{lot.notes}</p>
                            )}

                            {/* Status progression */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {Object.entries(LOT_STATUS).map(([k, v], i, arr) => (
                                <div key={k} className="flex items-center gap-1">
                                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                    lot.status === k ? `${v.bg} ${v.color} ring-2 ring-offset-1 ring-current` :
                                    Object.keys(LOT_STATUS).indexOf(k) < Object.keys(LOT_STATUS).indexOf(lot.status) ?
                                    'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                                  }`}>
                                    {v.icon} {v.label}
                                  </div>
                                  {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                </div>
                              ))}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 flex-wrap">
                              {hasNextStatus && (
                                <button onClick={() => advanceLotStatus(lot)}
                                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                  <ChevronRight className="w-3.5 h-3.5" />
                                  {lot.status === 'pending' ? 'เริ่มขนส่ง' :
                                   lot.status === 'in_transit' ? 'ถึงด่านแล้ว' :
                                   lot.status === 'arrived' ? 'ส่งลูกค้าแล้ว' : 'ปิดล็อต'}
                                </button>
                              )}
                              <button onClick={() => { ensureLotDocs(lot.id); setActiveTab('docs'); }}
                                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                <FileText className="w-3.5 h-3.5" /> จัดการเอกสาร
                              </button>
                              <button onClick={() => { setEditLot(lot); setShowLotForm(true); }}
                                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                              </button>
                              <button onClick={() => deleteLot(lot.id)}
                                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> ลบ
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: เอกสาร ── */}
          {activeTab === 'docs' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-semibold mb-1 flex items-center gap-2"><FileText className="w-4 h-4" /> เอกสารที่ต้องใช้ในการนำเข้า</p>
                <p className="text-xs opacity-80">ระบบจะสร้าง checklist 8 เอกสารหลักให้อัตโนมัติเมื่อกดปุ่ม &ldquo;จัดการเอกสาร&rdquo; ในแต่ละล็อต</p>
              </div>

              {/* Docs reference guide */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { doc: 'Invoice', desc: 'ใบแจ้งหนี้จากผู้ขาย แสดงราคา จำนวน และเงื่อนไขการขาย', required: true },
                  { doc: 'Packing List', desc: 'รายการบรรจุหีบห่อสินค้า แสดงน้ำหนักและปริมาณ', required: true },
                  { doc: 'Certificate of Origin', desc: 'ใบรับรองแหล่งกำเนิดสินค้า (Form D สำหรับ ASEAN)', required: true },
                  { doc: 'Phytosanitary Certificate', desc: 'ใบรับรองสุขอนามัยพืช จากกรมวิชาการเกษตรประเทศต้นทาง', required: true },
                  { doc: 'Bill of Lading / ใบขนส่ง', desc: 'เอกสารการขนส่ง ระบุรายละเอียดสินค้าและเส้นทาง', required: true },
                  { doc: 'ใบขนสินค้าขาเข้า (ศุลกากร)', desc: 'แบบฟอร์มกรมศุลกากร กศก.99/1 สำหรับผ่านพิธีการ', required: true },
                  { doc: 'ใบอนุญาตนำเข้า', desc: 'ใบอนุญาตนำเข้าจากกรมการค้าต่างประเทศ (บางสินค้า)', required: false },
                  { doc: 'ผลตรวจสอบคุณภาพ', desc: 'ผลวิเคราะห์ความชื้น สิ่งเจือปน และคุณภาพสินค้า', required: false },
                ].map(({ doc, desc, required }) => (
                  <div key={doc} className="bg-white border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${required ? 'bg-red-400' : 'bg-slate-300'}`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{doc}
                          <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${required ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                            {required ? 'บังคับ' : 'บางกรณี'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-lot doc checklist */}
              {lots.filter(l => documents.some(d => d.lot_id === l.id)).length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-600 mt-2">สถานะเอกสารตามล็อต</h3>
                  {lots.filter(l => documents.some(d => d.lot_id === l.id)).map(lot => {
                    const lotDocs = documents.filter(d => d.lot_id === lot.id);
                    const verified = lotDocs.filter(d => d.status === 'verified').length;
                    return (
                      <div key={lot.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                          <span className="font-semibold text-slate-700 text-sm">{lot.lot_number} — {lot.product_type}</span>
                          <span className={`text-xs font-medium ${verified === lotDocs.length ? 'text-green-600' : 'text-orange-600'}`}>
                            ยืนยันแล้ว {verified}/{lotDocs.length}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {lotDocs.map(doc => {
                            const st = DOC_STATUS_CONFIG[doc.status];
                            return (
                              <div key={doc.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                                  <span className="text-sm text-slate-700">{doc.doc_name}</span>
                                  {doc.received_date && <span className="text-xs text-slate-400">{formatDate(doc.received_date)}</span>}
                                </div>
                                <div className="flex gap-1">
                                  {(['pending', 'received', 'verified'] as const).map(s => (
                                    <button key={s} onClick={() => updateDocStatus(doc.id, s)}
                                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                        doc.status === s ? `${DOC_STATUS_CONFIG[s].bg} ${DOC_STATUS_CONFIG[s].color} ring-1 ring-current` :
                                        'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                      }`}>
                                      {DOC_STATUS_CONFIG[s].label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: ผู้ขาย ── */}
          {activeTab === 'suppliers' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-500">ฐานข้อมูลซัพพลายเออร์ต่างประเทศ</p>
                <button onClick={() => { setEditSupplier(null); setShowSupplierForm(true); }}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  <Plus className="w-4 h-4" /> เพิ่มผู้ขาย
                </button>
              </div>

              {suppliers.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>ยังไม่มีข้อมูลผู้ขาย</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suppliers.map(s => (
                    <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3" /> {s.country}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditSupplier(s); setShowSupplierForm(true); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {s.contact_name && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Users className="w-3 h-3" /> {s.contact_name}</p>}
                        {s.phone && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Phone className="w-3 h-3" /> {s.phone}</p>}
                        {s.email && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Mail className="w-3 h-3" /> {s.email}</p>}
                        {s.payment_terms && <p className="text-xs text-slate-500 flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> {s.payment_terms}</p>}
                      </div>
                      {s.notes && <p className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2">{s.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: สต็อกสินค้า ── */}
          {activeTab === 'stock' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                สต็อกคำนวณจากล็อตที่ &ldquo;ถึงด่านแล้ว&rdquo;, &ldquo;ส่งลูกค้าแล้ว&rdquo; และ &ldquo;ปิดงานแล้ว&rdquo; เท่านั้น
              </div>

              {stockItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>ยังไม่มีสต็อกสินค้า</p>
                  <p className="text-xs mt-1">สต็อกจะแสดงเมื่อล็อตถึงด่าน</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stockItems.map(item => {
                    const soldPct = item.total_weight > 0 ? (item.sold_weight / item.total_weight) * 100 : 0;
                    return (
                      <div key={item.product_type} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-bold text-slate-800">{item.product_type}</p>
                            <p className="text-xs text-slate-400">{item.lot_count} ล็อต</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-800">{formatWeight(item.remaining_weight)} ตัน</p>
                            <p className="text-xs text-slate-400">คงเหลือ</p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>ขายไปแล้ว {formatWeight(item.sold_weight)} ตัน</span>
                            <span>ทั้งหมด {formatWeight(item.total_weight)} ตัน</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${soldPct}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'ต้นทุนเฉลี่ย/ตัน', value: `฿${formatCurrency(item.avg_cost)}`, color: 'text-red-500' },
                            { label: 'ราคาขายเฉลี่ย/ตัน', value: `฿${formatCurrency(item.avg_sell)}`, color: 'text-blue-600' },
                            { label: 'กำไรเฉลี่ย/ตัน', value: `฿${formatCurrency(item.avg_sell - item.avg_cost)}`, color: item.avg_sell >= item.avg_cost ? 'text-green-600' : 'text-red-600' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-slate-50 rounded-lg p-2">
                              <div className="text-[10px] text-slate-400">{label}</div>
                              <div className={`text-sm font-semibold ${color}`}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lot Form Modal ── */}
      {showLotForm && (
        <LotFormModal
          lot={editLot}
          suppliers={suppliers}
          onClose={() => { setShowLotForm(false); setEditLot(null); }}
          onSaved={() => { setShowLotForm(false); setEditLot(null); loadData(); }}
        />
      )}

      {/* ── Supplier Form Modal ── */}
      {showSupplierForm && (
        <SupplierFormModal
          supplier={editSupplier}
          onClose={() => { setShowSupplierForm(false); setEditSupplier(null); }}
          onSaved={() => { setShowSupplierForm(false); setEditSupplier(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ── Lot Form Modal ────────────────────────────────────────────
function LotFormModal({ lot, suppliers, onClose, onSaved }: {
  lot: ImportLot | null; suppliers: Supplier[];
  onClose: () => void; onSaved: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const isEdit = !!lot;
  const [form, setForm] = useState({
    lot_number: lot?.lot_number || `LOT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    product_type: lot?.product_type || 'ข้าวโพด',
    origin_country: lot?.origin_country || 'เมียนมา',
    border_crossing: lot?.border_crossing || '',
    supplier: lot?.supplier || '',
    weight_tons: lot?.weight_tons?.toString() || '',
    cost_per_ton: lot?.cost_per_ton?.toString() || '',
    selling_price_per_ton: lot?.selling_price_per_ton?.toString() || '',
    arrival_date: lot?.arrival_date || '',
    delivery_date: lot?.delivery_date || '',
    notes: lot?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const weight = parseFloat(form.weight_tons) || 0;
  const cost = parseFloat(form.cost_per_ton) || 0;
  const sell = parseFloat(form.selling_price_per_ton) || 0;
  const previewProfit = (sell - cost) * weight;
  const previewMargin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;

  const handleSubmit = async () => {
    if (!form.lot_number || !form.weight_tons || !form.cost_per_ton) {
      setError('กรุณากรอกเลขล็อต น้ำหนัก และต้นทุน'); return;
    }
    setLoading(true); setError('');
    try {
      const payload = {
        lot_number: form.lot_number,
        product_type: form.product_type,
        origin_country: form.origin_country,
        border_crossing: form.border_crossing || null,
        supplier: form.supplier || null,
        weight_tons: parseFloat(form.weight_tons),
        cost_per_ton: parseFloat(form.cost_per_ton),
        selling_price_per_ton: parseFloat(form.selling_price_per_ton) || 0,
        arrival_date: form.arrival_date || null,
        delivery_date: form.delivery_date || null,
        notes: form.notes || null,
      };
      let err;
      if (isEdit && lot) {
        ({ error: err } = await supabase.from('import_lots').update(payload).eq('id', lot.id));
      } else {
        ({ error: err } = await supabase.from('import_lots').insert(payload));
      }
      if (err) { setError(err.message); return; }
      onSaved();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> {isEdit ? 'แก้ไขล็อต' : 'เพิ่มล็อตใหม่'}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">เลขล็อต *</label>
              <input className="form-input" value={form.lot_number} onChange={e => f('lot_number', e.target.value)} />
            </div>
            <div>
              <label className="label-text">ประเภทสินค้า *</label>
              <select className="form-input" value={form.product_type} onChange={e => f('product_type', e.target.value)}>
                {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">ประเทศต้นทาง</label>
              <select className="form-input" value={form.origin_country} onChange={e => f('origin_country', e.target.value)}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">ด่านชายแดน</label>
              <select className="form-input" value={form.border_crossing} onChange={e => f('border_crossing', e.target.value)}>
                <option value="">- เลือก -</option>
                {BORDER_CROSSINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label-text">ผู้ขาย (Supplier)</label>
            <select className="form-input" value={form.supplier} onChange={e => f('supplier', e.target.value)}>
              <option value="">- ไม่ระบุ -</option>
              {suppliers.map(s => <option key={s.id} value={s.name}>{s.name} ({s.country})</option>)}
            </select>
          </div>

          <div>
            <label className="label-text">น้ำหนัก (ตัน) *</label>
            <input type="number" className="form-input" value={form.weight_tons} onChange={e => f('weight_tons', e.target.value)} placeholder="0.000" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">ต้นทุน/ตัน (บาท) *</label>
              <input type="number" className="form-input" value={form.cost_per_ton} onChange={e => f('cost_per_ton', e.target.value)} />
            </div>
            <div>
              <label className="label-text">ราคาขาย/ตัน (บาท)</label>
              <input type="number" className="form-input" value={form.selling_price_per_ton} onChange={e => f('selling_price_per_ton', e.target.value)} />
            </div>
          </div>

          {/* Live Profit Preview */}
          {weight > 0 && cost > 0 && (
            <div className={`rounded-xl p-3 ${previewProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs font-semibold text-slate-500 mb-2">ประมาณการกำไร</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'รายได้รวม', value: `฿${formatCurrency(sell * weight)}`, color: 'text-blue-600' },
                  { label: 'ต้นทุนรวม', value: `฿${formatCurrency(cost * weight)}`, color: 'text-red-500' },
                  { label: 'กำไรรวม',  value: `฿${formatCurrency(previewProfit)}`, color: previewProfit >= 0 ? 'text-green-600' : 'text-red-600' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="text-[10px] text-slate-400">{label}</div>
                    <div className={`text-sm font-bold ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="text-center mt-1.5">
                <span className={`text-xs font-medium ${previewProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  margin {previewMargin.toFixed(1)}% · กำไร/ตัน ฿{formatCurrency(sell - cost)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">วันที่ถึงด่าน</label>
              <input type="date" className="form-input" value={form.arrival_date} onChange={e => f('arrival_date', e.target.value)} />
            </div>
            <div>
              <label className="label-text">วันที่ส่งลูกค้า</label>
              <input type="date" className="form-input" value={form.delivery_date} onChange={e => f('delivery_date', e.target.value)} />
            </div>
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
            {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มล็อต'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supplier Form Modal ───────────────────────────────────────
function SupplierFormModal({ supplier, onClose, onSaved }: {
  supplier: Supplier | null; onClose: () => void; onSaved: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name || '',
    country: supplier?.country || 'เมียนมา',
    contact_name: supplier?.contact_name || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    payment_terms: supplier?.payment_terms || '',
    notes: supplier?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.country) { setError('กรุณากรอกชื่อผู้ขายและประเทศ'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        name: form.name, country: form.country,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        payment_terms: form.payment_terms || null,
        notes: form.notes || null,
      };
      let err;
      if (isEdit && supplier) {
        ({ error: err } = await supabase.from('shipping_suppliers').update(payload).eq('id', supplier.id));
      } else {
        ({ error: err } = await supabase.from('shipping_suppliers').insert(payload));
      }
      if (err) { setError(err.message); return; }
      onSaved();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" /> {isEdit ? 'แก้ไขผู้ขาย' : 'เพิ่มผู้ขายใหม่'}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
          <div>
            <label className="label-text">ชื่อบริษัท/ผู้ขาย *</label>
            <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="เช่น Myanmar Corn Co., Ltd." />
          </div>
          <div>
            <label className="label-text">ประเทศ *</label>
            <select className="form-input" value={form.country} onChange={e => f('country', e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">ชื่อผู้ติดต่อ</label>
            <input className="form-input" value={form.contact_name} onChange={e => f('contact_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">เบอร์โทร</label>
              <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} />
            </div>
            <div>
              <label className="label-text">Email</label>
              <input type="email" className="form-input" value={form.email} onChange={e => f('email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-text">เงื่อนไขการชำระเงิน</label>
            <input className="form-input" value={form.payment_terms} onChange={e => f('payment_terms', e.target.value)} placeholder="เช่น T/T 30 days, L/C at sight" />
          </div>
          <div>
            <label className="label-text">หมายเหตุ</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isEdit ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEdit ? 'บันทึก' : 'เพิ่มผู้ขาย'}
          </button>
        </div>
      </div>
    </div>
  );
}
