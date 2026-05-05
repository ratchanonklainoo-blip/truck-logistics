'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  UserCheck, Plus, Pencil, CreditCard, Shield,
  ChevronRight, ChevronDown, X, Check, Truck,
  Fuel, BarChart3, Phone,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      driver_key: form.driver_key,
      name: form.name, nickname: form.nickname,
      license_plate: form.license_plate,
      bank_account: form.bank_account || null,
      social_security: Number(form.social_security) || 750,
      base_salary: Number(form.base_salary) || 5000,
      commission_rate: Number(form.commission_rate) || 0.10,
      monthly_advance_limit: Number(form.monthly_advance_limit) || 5000,
      line_user_id: form.line_user_id || null,
    };
    if (editing) {
      await supabase.from('drivers').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('drivers').insert({ ...payload, is_active: true });
    }
    setShowForm(false); setEditing(null); setForm(EMPTY_FORM);
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">คนขับ</h1>
            <p className="text-sm text-slate-500">{drivers.length} คน · กำลังวิ่ง {Object.values(driverStats).filter(s => s.activeJob).length} คน</p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> เพิ่มคนขับ
        </button>
      </div>

      {/* Driver Cards */}
      <div className="space-y-3">
        {drivers.map(d => {
          const stats = driverStats[d.id] || { tripCount: 0, totalRevenue: 0, totalCommission: 0, totalDistance: 0, avgFuelEfficiency: 0, activeJob: null };
          const isExp = expanded === d.id;
          return (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-700 font-bold text-lg">
                    {d.nickname.charAt(0) || d.name.charAt(0)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-slate-800 text-base">{d.nickname}</span>
                    <span className="text-slate-500 text-sm">{d.name}</span>
                    {stats.activeJob ? (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                        <Truck className="w-3 h-3" /> {stats.activeJob}
                      </span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">ว่าง</span>
                    )}
                    {d.line_user_id ? (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">LINE ✓</span>
                    ) : (
                      <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full border border-red-200">ไม่มี LINE</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500 mb-2">
                    <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />{d.license_plate}</span>
                    <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />ประกันสังคม {formatCurrency(d.social_security)}</span>
                    <span>เงินเดือน {formatCurrency(d.base_salary)}</span>
                    <span>วงเบิก {formatCurrency(d.monthly_advance_limit || 5000)}/เดือน</span>
                  </div>

                  {/* Mini Stats */}
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-600"><span className="font-bold text-slate-800">{stats.tripCount}</span> เที่ยว</span>
                    <span className="text-blue-600"><span className="font-bold">{formatCurrency(stats.totalRevenue)}</span> รายได้</span>
                    <span className="text-green-600"><span className="font-bold">{formatCurrency(stats.totalCommission)}</span> ค่ารอบ</span>
                    <span className="text-orange-600"><span className="font-bold">{stats.totalDistance.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span> กม.</span>
                    {stats.avgFuelEfficiency > 0 && (
                      <span className="text-slate-500"><span className="font-bold">{stats.avgFuelEfficiency}</span> กม./ล.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleEdit(d)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleExpand(d.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded Detail */}
              {isExp && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: Truck, label: 'เที่ยวทั้งหมด', value: `${stats.tripCount} เที่ยว`, color: 'text-blue-600' },
                      { icon: BarChart3, label: 'รายได้รวม', value: formatCurrency(stats.totalRevenue), color: 'text-green-600' },
                      { icon: CreditCard, label: 'ค่ารอบรวม', value: formatCurrency(stats.totalCommission), color: 'text-indigo-600' },
                      { icon: Fuel, label: 'อัตราสิ้นเปลือง', value: stats.avgFuelEfficiency > 0 ? `${stats.avgFuelEfficiency} กม./ล.` : '-', color: 'text-orange-600' },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-white rounded-lg p-3 border border-slate-200 text-center">
                        <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                        <div className="font-bold text-slate-800 text-sm">{value}</div>
                        <div className="text-xs text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                  {d.bank_account && (
                    <p className="text-xs text-slate-500 mt-3">เลขบัญชี: {d.bank_account}</p>
                  )}
                  {d.line_user_id && (
                    <p className="text-xs text-slate-500 mt-1">LINE User ID: {d.line_user_id}</p>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-800">{editing ? 'แก้ไขคนขับ' : 'เพิ่มคนขับ'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">ชื่อ-นามสกุล *</label>
                  <input className="form-input" required value={form.name} onChange={e => f('name', e.target.value)} />
                </div>
                <div>
                  <label className="label-text">ชื่อเล่น *</label>
                  <input className="form-input" required value={form.nickname} onChange={e => f('nickname', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">รหัสคนขับ</label>
                  <input className="form-input" value={form.driver_key} onChange={e => f('driver_key', e.target.value)} placeholder="เช่น DR001" />
                </div>
                <div>
                  <label className="label-text">ทะเบียนรถ *</label>
                  <input className="form-input" required value={form.license_plate} onChange={e => f('license_plate', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label-text">LINE User ID <span className="text-slate-400 font-normal">(สำหรับ bot แจ้งเตือน)</span></label>
                <input className="form-input font-mono text-sm" value={form.line_user_id} onChange={e => f('line_user_id', e.target.value)} placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                <p className="text-xs text-slate-400 mt-1">ได้จาก LINE Developers Console หรือให้คนขับส่งข้อความมาหา bot</p>
              </div>
              <div>
                <label className="label-text">เลขบัญชีธนาคาร</label>
                <input className="form-input" value={form.bank_account} onChange={e => f('bank_account', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-text">เงินเดือน (บาท)</label>
                  <input type="number" className="form-input" value={form.base_salary} onChange={e => f('base_salary', e.target.value)} />
                </div>
                <div>
                  <label className="label-text">ประกันสังคม</label>
                  <input type="number" className="form-input" value={form.social_security} onChange={e => f('social_security', e.target.value)} />
                </div>
                <div>
                  <label className="label-text">วงเงินเบิก/เดือน</label>
                  <input type="number" className="form-input" value={form.monthly_advance_limit} onChange={e => f('monthly_advance_limit', e.target.value)} />
                </div>
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
