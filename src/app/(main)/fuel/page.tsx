'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Fuel, CheckCircle, Clock, AlertTriangle, Eye, XCircle,
  ChevronDown, ChevronUp, RefreshCw, Filter, BadgeCheck, Banknote,
} from 'lucide-react';
import type { FuelEvent, Driver } from '@/types';
import { formatCurrency } from '@/lib/utils';

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  waiting_data:     { label: 'รอรูปภาพ',      color: 'text-slate-600',  bg: 'bg-slate-100',  icon: Clock },
  waiting_ocr:      { label: 'กำลัง OCR',      color: 'text-blue-600',   bg: 'bg-blue-100',   icon: RefreshCw },
  needs_review:     { label: 'ต้องตรวจสอบ',    color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
  waiting_approval: { label: 'รอตรวจสอบ',      color: 'text-purple-600', bg: 'bg-purple-100', icon: Eye },
  waiting_payment:  { label: 'รอจ่ายเงิน',     color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Banknote },
  paid:             { label: 'จ่ายแล้ว',        color: 'text-green-600',  bg: 'bg-green-100',  icon: CheckCircle },
};

export default function FuelPage() {
  const supabase = createClient();
  const [fuelEvents, setFuelEvents]     = useState<FuelEvent[]>([]);
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<FuelEvent | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: fe }, { data: dr }] = await Promise.all([
      supabase
        .from('fuel_events')
        .select('*, driver:drivers(id, name, nickname, license_plate)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
    ]);
    setFuelEvents(fe || []);
    setDrivers(dr || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('fuel_events_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_events' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const filtered = useMemo(() => {
    return fuelEvents.filter(fe => {
      if (selectedStatus !== 'all' && fe.status !== selectedStatus) return false;
      if (selectedDriver !== 'all' && fe.driver_id !== selectedDriver) return false;
      return true;
    });
  }, [fuelEvents, selectedStatus, selectedDriver]);

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      waiting: fuelEvents.filter(f => ['waiting_approval', 'needs_review'].includes(f.status)).length,
      waitingPayment: fuelEvents.filter(f => f.status === 'waiting_payment').length,
      anomalies: fuelEvents.filter(f => f.is_anomaly).length,
      totalPaid: fuelEvents.filter(f => f.status === 'paid').reduce((s, f) => s + (f.amount_baht || 0), 0),
    };
  }, [fuelEvents]);

  // ── Actions ───────────────────────────────────────────────
  const handleVerify = async (id: string, overrides?: Partial<FuelEvent>) => {
    setActionLoading(id + '-verify');
    try {
      const res = await fetch(`/api/fuel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', ...overrides }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'เกิดข้อผิดพลาด');
        return;
      }
      await loadData();
      setEditingEvent(null);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePay = async (id: string) => {
    if (!confirm('ยืนยันการจ่ายเงินค่าน้ำมัน?')) return;
    setActionLoading(id + '-pay');
    try {
      const res = await fetch(`/api/fuel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay' }),
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
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <Fuel className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">เติมน้ำมัน</h1>
            <p className="text-sm text-slate-500">จัดการรายการเติมน้ำมัน + OCR</p>
          </div>
        </div>
        <button onClick={loadData} className="btn-secondary text-sm">
          <RefreshCw className="w-4 h-4" /> รีเฟรช
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="รอตรวจสอบ" value={stats.waiting} color="purple" icon={Eye} />
        <StatCard label="รอจ่ายเงิน" value={stats.waitingPayment} color="yellow" icon={Banknote} />
        <StatCard label="ผิดปกติ" value={stats.anomalies} color="red" icon={AlertTriangle} />
        <StatCard label="จ่ายแล้วเดือนนี้" value={formatCurrency(stats.totalPaid)} color="green" icon={CheckCircle} isText />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          className="form-input text-sm w-44"
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
        >
          <option value="all">ทุกสถานะ</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="form-input text-sm w-48"
          value={selectedDriver}
          onChange={e => setSelectedDriver(e.target.value)}
        >
          <option value="all">คนขับทั้งหมด</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{d.nickname} ({d.name})</option>
          ))}
        </select>
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} รายการ</span>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Fuel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400">ไม่พบรายการเติมน้ำมัน</p>
          </div>
        )}

        {filtered.map(fe => (
          <FuelEventCard
            key={fe.id}
            event={fe}
            expanded={expandedId === fe.id}
            onToggle={() => setExpandedId(expandedId === fe.id ? null : fe.id)}
            onVerify={handleVerify}
            onPay={handlePay}
            actionLoading={actionLoading}
            onEdit={() => setEditingEvent(fe)}
          />
        ))}
      </div>

      {/* Edit/Verify Modal */}
      {editingEvent && (
        <VerifyModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onConfirm={(id, overrides) => handleVerify(id, overrides)}
          loading={actionLoading === editingEvent.id + '-verify'}
        />
      )}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({
  label, value, color, icon: Icon, isText = false,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ElementType;
  isText?: boolean;
}) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red:    'bg-red-50    text-red-600',
    green:  'bg-green-50  text-green-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className={`font-bold ${isText ? 'text-lg' : 'text-2xl'} text-slate-800`}>{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

// ── Fuel Event Card ───────────────────────────────────────────
function FuelEventCard({
  event: fe, expanded, onToggle, onVerify, onPay, actionLoading, onEdit,
}: {
  event: FuelEvent;
  expanded: boolean;
  onToggle: () => void;
  onVerify: (id: string, overrides?: Partial<FuelEvent>) => void;
  onPay: (id: string) => void;
  actionLoading: string | null;
  onEdit: () => void;
}) {
  const sc = STATUS_CONFIG[fe.status] || STATUS_CONFIG.waiting_data;
  const StatusIcon = sc.icon;
  const driver = fe.driver as Driver | undefined;
  const isVerifying = actionLoading === fe.id + '-verify';
  const isPaying    = actionLoading === fe.id + '-pay';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      fe.is_anomaly ? 'border-red-300' : 'border-slate-200'
    }`}>
      {/* Main row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Status badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${sc.bg} ${sc.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {sc.label}
        </div>

        {/* Driver */}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 text-sm">
            {driver?.nickname || driver?.name || '-'}
            {fe.is_anomaly && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> ผิดปกติ
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400">{driver?.license_plate}</div>
        </div>

        {/* OCR Data */}
        <div className="text-right hidden sm:block">
          {fe.station_name && <div className="text-sm font-medium text-slate-700">{fe.station_name}</div>}
          {fe.amount_baht != null && (
            <div className="text-sm text-orange-600 font-bold">{formatCurrency(fe.amount_baht)}</div>
          )}
          {fe.fuel_liters != null && (
            <div className="text-xs text-slate-400">{fe.fuel_liters.toFixed(2)} ลิตร</div>
          )}
        </div>

        {/* Photos indicator */}
        <div className="flex gap-1">
          {(['photo_pump_url', 'photo_payment_url', 'photo_odometer_url'] as const).map((k, i) => (
            <div
              key={k}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                fe[k] ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Date */}
        <div className="text-xs text-slate-400 whitespace-nowrap">
          {new Date(fe.created_at).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {['waiting_approval', 'needs_review'].includes(fe.status) && (
            <button
              onClick={onEdit}
              disabled={isVerifying}
              className="btn-primary text-xs py-1.5 px-3"
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              ตรวจสอบ
            </button>
          )}
          {fe.status === 'waiting_payment' && (
            <button
              onClick={() => onPay(fe.id)}
              disabled={isPaying}
              className="btn-primary text-xs py-1.5 px-3 bg-green-600 hover:bg-green-700"
            >
              {isPaying
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Banknote className="w-3.5 h-3.5" />}
              จ่ายเงิน
            </button>
          )}
        </div>

        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-4">
          {/* Photos */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">รูปภาพ</p>
            <div className="flex gap-3">
              {[
                { key: 'photo_pump_url' as const,    label: 'หัวจ่าย' },
                { key: 'photo_payment_url' as const, label: 'การจ่ายเงิน' },
                { key: 'photo_odometer_url' as const, label: 'เลขไมล์' },
              ].map(({ key, label }) => (
                <div key={key} className="flex-1">
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  {fe[key] ? (
                    <a href={fe[key]!} target="_blank" rel="noopener noreferrer">
                      <img
                        src={fe[key]!}
                        alt={label}
                        className="w-full h-32 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ) : (
                    <div className="w-full h-32 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 text-xs">
                      ยังไม่มีรูป
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* OCR Data */}
          {(fe.station_name || fe.amount_baht || fe.fuel_liters || fe.odometer) && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                ข้อมูล OCR
                {fe.ocr_confidence != null && (
                  <span className={`ml-2 font-normal normal-case ${
                    fe.ocr_confidence >= 0.85 ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    ความมั่นใจ: {(fe.ocr_confidence * 100).toFixed(0)}%
                  </span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'ปั๊มน้ำมัน',   value: fe.station_name },
                  { label: 'ยอดรวม',       value: fe.amount_baht != null ? formatCurrency(fe.amount_baht) : null },
                  { label: 'จำนวนลิตร',    value: fe.fuel_liters != null ? `${fe.fuel_liters.toFixed(2)} ลิตร` : null },
                  { label: 'ราคา/ลิตร',    value: fe.price_per_liter != null ? formatCurrency(fe.price_per_liter) : null },
                  { label: 'เลขไมล์',      value: fe.odometer != null ? fe.odometer.toLocaleString('th-TH') + ' กม.' : null },
                  { label: 'วิธีชำระ',     value: fe.payment_method },
                ].filter(r => r.value).map(row => (
                  <div key={row.label} className="bg-white rounded-lg p-3 border border-slate-200">
                    <p className="text-xs text-slate-400">{row.label}</p>
                    <p className="font-semibold text-slate-800 text-sm mt-0.5">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anomaly */}
          {fe.is_anomaly && fe.anomaly_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{fe.anomaly_reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Verify Modal ──────────────────────────────────────────────
function VerifyModal({
  event: fe, onClose, onConfirm, loading,
}: {
  event: FuelEvent;
  onClose: () => void;
  onConfirm: (id: string, overrides?: Partial<FuelEvent>) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    station_name:   fe.station_name   || '',
    amount_baht:    fe.amount_baht    ?? '',
    fuel_liters:    fe.fuel_liters    ?? '',
    price_per_liter: fe.price_per_liter ?? '',
    odometer:       fe.odometer       ?? '',
    payment_method: fe.payment_method || '',
  });

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    onConfirm(fe.id, {
      station_name:    form.station_name || undefined,
      amount_baht:     form.amount_baht !== '' ? Number(form.amount_baht) : undefined,
      fuel_liters:     form.fuel_liters !== '' ? Number(form.fuel_liters) : undefined,
      price_per_liter: form.price_per_liter !== '' ? Number(form.price_per_liter) : undefined,
      odometer:        form.odometer !== '' ? Number(form.odometer) : undefined,
      payment_method:  form.payment_method || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-blue-600" /> ตรวจสอบน้ำมัน
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <XCircle className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {fe.is_anomaly && fe.anomaly_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{fe.anomaly_reason}</p>
            </div>
          )}

          {/* Photos thumbnail */}
          <div className="flex gap-2">
            {[fe.photo_pump_url, fe.photo_payment_url, fe.photo_odometer_url].map((url, i) =>
              url ? (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <img src={url} alt={`photo${i + 1}`} className="w-full h-24 object-cover rounded-lg" />
                </a>
              ) : (
                <div key={i} className="flex-1 h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-xs">ไม่มีรูป</div>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label-text">ชื่อปั๊มน้ำมัน</label>
              <input className="form-input" value={form.station_name} onChange={e => set('station_name', e.target.value)} />
            </div>
            <div>
              <label className="label-text">ยอดรวม (บาท)</label>
              <input type="number" className="form-input" value={form.amount_baht} onChange={e => set('amount_baht', e.target.value)} />
            </div>
            <div>
              <label className="label-text">จำนวนลิตร</label>
              <input type="number" step="0.01" className="form-input" value={form.fuel_liters} onChange={e => set('fuel_liters', e.target.value)} />
            </div>
            <div>
              <label className="label-text">ราคา/ลิตร (บาท)</label>
              <input type="number" step="0.01" className="form-input" value={form.price_per_liter} onChange={e => set('price_per_liter', e.target.value)} />
            </div>
            <div>
              <label className="label-text">เลขไมล์</label>
              <input type="number" className="form-input" value={form.odometer} onChange={e => set('odometer', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label-text">วิธีชำระเงิน</label>
              <select className="form-input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                <option value="">- เลือก -</option>
                <option value="cash">เงินสด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="qr">QR Code</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <BadgeCheck className="w-4 h-4" />}
            ยืนยันและอนุมัติ
          </button>
        </div>
      </div>
    </div>
  );
}
