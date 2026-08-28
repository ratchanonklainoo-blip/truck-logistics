'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  UserCheck, Plus, Pencil, CreditCard, Shield,
  ChevronDown, ChevronUp, X, Check, Truck,
  Fuel, BarChart3, Phone, Wallet, MessageCircle,
  Circle, Trash2,
} from 'lucide-react';
import type { Driver } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface DriverStats {
  tripCount: number;
  totalRevenue: number;
  totalCommission: number;
  totalDistance: number;
  avgFuelEfficiency: number;
  activeJob: string | null;
}

const EMPTY_FORM = {
  driver_key: '', name: '', nickname: '', license_plate: '',
  bank_account: '', social_security: '750', base_salary: '5000',
  commission_rate: '0.10', monthly_advance_limit: '5000',
  line_user_id: '', phone: '',
};

export default function DriversPage() {
  const [supabase] = useState(() => createClient());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverStats, setDriverStats] = useState<Record<string, DriverStats>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    const [{ data: drData }, { data: tripData }, { data: jobData }] = await Promise.all([
      supabase.from('drivers').select('*').is('deleted_at', null).order('created_at'),
      supabase.from('trips').select('driver_id,transport_price,trip_pay,distance,fuel_litres,fuel_cost')
        .is('deleted_at', null),
      supabase.from('jobs').select('assigned_driver_id,status,origin,destination')
        .is('deleted_at', null).eq('status', 'in_progress'),
    ]);
    const drList = drData || [];
    const tripList = tripData || [];
    const jobList = jobData || [];
    const statsMap: Record<string, DriverStats> = {};
    drList.forEach(d => {
      const dTrips = tripList.filter(t => t.driver_id === d.id);
      const totalDist = dTrips.reduce((s, t) => s + (t.distance || 0), 0);
      const totalFuel = dTrips.reduce((s, t) => s + (t.fuel_litres || 0), 0);
      const activeJob = jobList.find(j => j.assigned_driver_id === d.id);
      statsMap[d.id] = {
        tripCount: dTrips.length,
        totalRevenue: dTrips.reduce((s, t) => s + (t.transport_price || 0), 0),
        totalCommission: dTrips.reduce((s, t) => s + (t.trip_pay || t.transport_price * 0.10 || 0), 0),
        totalDistance: totalDist,
        avgFuelEfficiency: totalFuel > 0 ? Math.round((totalDist / totalFuel) * 10) / 10 : 0,
        activeJob: activeJob ? `${activeJob.origin} → ${activeJob.destination}` : null,
      };
    });
    setDrivers(drList);
    setDriverStats(statsMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(''); setSaving(true);
    const payload = {
      driver_key: form.driver_key,
      name: form.name, nickname: form.nickname,
      license_plate: form.license_plate,
      bank_account: form.bank_account || null,
      social_security: Number(form.social_security) || 0,
      base_salary: form.base_salary === '' ? 0 : Number(form.base_salary),
      commission_rate: Number(form.commission_rate) || 0.10,
      monthly_advance_limit: form.monthly_advance_limit === '' ? 0 : Number(form.monthly_advance_limit),
      line_user_id: form.line_user_id || null,
      updated_at: new Date().toISOString(),
    };
    try {
      let error;
      if (editing) {
        ({ error } = await supabase.from('drivers').update(payload).eq('id', editing.id));
      } else {
        ({ error } = await supabase.from('drivers').insert({ ...payload, is_active: true }));
      }
      if (error) {
        setSaveError(`บันทึกไม่สำเร็จ: ${error.message}`);
        setSaving(false);
        return;
      }
      setShowForm(false); setEditing(null); setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setSaveError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: Driver) => {
    // Block delete if driver has active job
    const { data: activeJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('assigned_driver_id', d.id)
      .in('status', ['assigned', 'driver_accepted', 'in_progress'])
      .is('deleted_at', null)
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      alert(`ไม่สามารถลบ ${d.nickname || d.name} ได้ — มีงานที่กำลังดำเนินอยู่`);
      return;
    }

    if (!confirm(`ยืนยันลบคนขับ "${d.nickname || d.name}" ออกจากระบบ?\nข้อมูลการเดินทางและเงินเดือนจะยังคงอยู่`)) return;

    const { error } = await supabase
      .from('drivers')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', d.id);

    if (error) {
      alert('ลบไม่สำเร็จ: ' + error.message);
      return;
    }
    load();
  };

  const handleEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      driver_key: d.driver_key,
      name: d.name, nickname: d.nickname,
      license_plate: d.license_plate,
      bank_account: d.bank_account || '',
      social_security: String(d.social_security),
      base_salary: String(d.base_salary),
      commission_rate: String(d.commission_rate),
      monthly_advance_limit: String(d.monthly_advance_limit || 5000),
      line_user_id: d.line_user_id || '',
      phone: '',
    });
    setShowForm(true);
  };

  const toggleExpand = (id: string) => setExpanded(p => p === id ? null : id);
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const activeCount = Object.values(driverStats).filter(s => s.activeJob).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">คนขับ</h1>
            <p className="text-sm text-slate-500">
              ทั้งหมด {drivers.length} คน ·
              <span className="text-orange-600 font-medium"> กำลังวิ่ง {activeCount} คน</span> ·
              <span className="text-green-600 font-medium"> ว่าง {drivers.length - activeCount} คน</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); }}
          className="btn-primary text-sm"
        >
          <Plus className="w-4 h-4" /> เพิ่มคนขับ
        </button>
      </div>

      {/* Driver Cards */}
      <div className="space-y-3">
        {drivers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <UserCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">ยังไม่มีคนขับ</p>
            <p className="text-sm mt-1">กดปุ่ม &quot;เพิ่มคนขับ&quot; เพื่อเริ่มต้น</p>
          </div>
        ) : drivers.map(d => {
          const stats = driverStats[d.id] || {
            tripCount: 0, totalRevenue: 0, totalCommission: 0,
            totalDistance: 0, avgFuelEfficiency: 0, activeJob: null,
          };
          const isExp = expanded === d.id;
          const isActive = !!stats.activeJob;

          return (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* ── Main Row ── */}
              <div className="flex items-center gap-4 px-5 py-4">

                {/* Avatar + status dot */}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-700 font-bold text-lg leading-none">
                      {(d.nickname || d.name).charAt(0)}
                    </span>
                  </div>
                  <Circle
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${isActive ? 'text-orange-400' : 'text-green-400'}`}
                    fill="currentColor"
                    strokeWidth={3}
                    stroke="white"
                  />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{d.nickname}</span>
                    <span className="text-slate-400 text-sm">{d.name}</span>

                    {/* Status badge */}
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-medium">
                        <Truck className="w-3 h-3" />
                        {stats.activeJob}
                      </span>
                    ) : (
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                        ว่าง
                      </span>
                    )}
                  </div>

                  {/* Secondary info row */}
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5" />
                      {d.license_plate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wallet className="w-3.5 h-3.5" />
                      {formatCurrency(d.base_salary)}/เดือน
                    </span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${d.line_user_id ? 'text-green-600' : 'text-red-400'}`}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      {d.line_user_id ? 'LINE ✓' : 'ไม่มี LINE'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(d)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="แก้ไข"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="ลบคนขับ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleExpand(d.id)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="ดูสถิติ"
                  >
                    {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* ── Expanded: Stats + Details ── */}
              {isExp && (
                <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 space-y-4">

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                      <Truck className="w-4 h-4 mx-auto mb-1 text-blue-500" />
                      <div className="text-lg font-bold text-slate-800">{stats.tripCount}</div>
                      <div className="text-xs text-slate-400">เที่ยวทั้งหมด</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                      <BarChart3 className="w-4 h-4 mx-auto mb-1 text-green-500" />
                      <div className="text-base font-bold text-slate-800">{formatCurrency(stats.totalRevenue)}</div>
                      <div className="text-xs text-slate-400">รายได้รวม</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                      <CreditCard className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                      <div className="text-base font-bold text-slate-800">{formatCurrency(stats.totalCommission)}</div>
                      <div className="text-xs text-slate-400">ค่ารอบรวม</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                      <Fuel className="w-4 h-4 mx-auto mb-1 text-orange-500" />
                      <div className="text-lg font-bold text-slate-800">
                        {stats.avgFuelEfficiency > 0 ? `${stats.avgFuelEfficiency}` : '—'}
                      </div>
                      <div className="text-xs text-slate-400">กม./ลิตร</div>
                    </div>
                  </div>

                  {/* Detail info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />ประกันสังคม</span>
                      <span className="font-medium text-slate-700">{formatCurrency(d.social_security)}/เดือน</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" />วงเงินเบิก</span>
                      <span className="font-medium text-slate-700">{formatCurrency(d.monthly_advance_limit || 5000)}/เดือน</span>
                    </div>
                    {d.bank_account && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">เลขบัญชี</span>
                        <span className="font-mono text-sm text-slate-700">{d.bank_account}</span>
                      </div>
                    )}
                    {d.line_user_id && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">LINE User ID</span>
                        <span className="font-mono text-xs text-slate-500 truncate max-w-[160px]">{d.line_user_id}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">ระยะทางรวม</span>
                      <span className="font-medium text-slate-700">{stats.totalDistance.toLocaleString('th-TH', { maximumFractionDigits: 0 })} กม.</span>
                    </div>
                    {d.driver_key && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">รหัสคนขับ</span>
                        <span className="font-medium text-slate-700">{d.driver_key}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-800">
                {editing ? 'แก้ไขข้อมูลคนขับ' : 'เพิ่มคนขับใหม่'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* ชื่อ + ชื่อเล่น */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">ชื่อ-นามสกุล *</label>
                  <input className="form-input" required value={form.name}
                    onChange={e => f('name', e.target.value)} placeholder="สมชาย ใจดี" />
                </div>
                <div>
                  <label className="form-label">ชื่อเล่น *</label>
                  <input className="form-input" required value={form.nickname}
                    onChange={e => f('nickname', e.target.value)} placeholder="ชาย" />
                </div>
              </div>

              {/* รหัส + ทะเบียน */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">รหัสคนขับ</label>
                  <input className="form-input" value={form.driver_key}
                    onChange={e => f('driver_key', e.target.value)} placeholder="DR001" />
                </div>
                <div>
                  <label className="form-label">ทะเบียนรถ *</label>
                  <input className="form-input" required value={form.license_plate}
                    onChange={e => f('license_plate', e.target.value)} placeholder="กข 1234" />
                </div>
              </div>

              {/* LINE User ID */}
              <div>
                <label className="form-label">
                  LINE User ID
                  <span className="text-slate-400 font-normal ml-1">(สำหรับ bot แจ้งเตือน)</span>
                </label>
                <input className="form-input font-mono text-sm" value={form.line_user_id}
                  onChange={e => f('line_user_id', e.target.value)}
                  placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                <p className="text-xs text-slate-400 mt-1">ให้คนขับส่งข้อความหา bot แล้วดู log เพื่อหา User ID</p>
              </div>

              {/* เลขบัญชี */}
              <div>
                <label className="form-label">เลขบัญชีธนาคาร</label>
                <input className="form-input" value={form.bank_account}
                  onChange={e => f('bank_account', e.target.value)} placeholder="xxx-x-xxxxx-x" />
              </div>

              {/* เงินเดือน / ประกัน / วงเบิก */}
              <div>
                <label className="form-label text-slate-600 text-xs font-semibold uppercase tracking-wide mb-2 block">การเงิน</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="form-label">เงินเดือน (บาท)</label>
                    <input type="number" min="0" className="form-input" value={form.base_salary}
                      placeholder="0 = ทดลองงาน"
                      onChange={e => f('base_salary', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">ประกันสังคม</label>
                    <input type="number" className="form-input" value={form.social_security}
                      onChange={e => f('social_security', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">วงเบิก/เดือน</label>
                    <input type="number" className="form-input" value={form.monthly_advance_limit}
                      onChange={e => f('monthly_advance_limit', e.target.value)} />
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
                  {saveError}
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setShowForm(false); setSaveError(''); }} className="btn-secondary">
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
