'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserCheck, Plus, Pencil, Phone, CreditCard, Shield } from 'lucide-react';
import type { Driver } from '@/types';
import { formatCurrency } from '@/lib/utils';

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Driver | null>(null);
  const [form, setForm] = useState({
    driver_key: '', name: '', nickname: '', license_plate: '',
    bank_account: '', social_security: '', base_salary: '5000',
    commission_rate: '0.10',
  });

  const load = async () => {
    const { data } = await supabase.from('drivers').select('*').is('deleted_at', null).order('created_at');
    setDrivers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      social_security: Number(form.social_security) || 0,
      base_salary:     Number(form.base_salary)     || 5000,
      commission_rate: Number(form.commission_rate) || 0.10,
    };
    if (editing) {
      await supabase.from('drivers').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('drivers').insert(payload);
    }
    setShowForm(false); setEditing(null);
    setForm({ driver_key:'', name:'', nickname:'', license_plate:'', bank_account:'', social_security:'', base_salary:'5000', commission_rate:'0.10' });
    load();
  };

  const handleEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      driver_key:      d.driver_key,
      name:            d.name,
      nickname:        d.nickname,
      license_plate:   d.license_plate,
      bank_account:    d.bank_account || '',
      social_security: String(d.social_security),
      base_salary:     String(d.base_salary),
      commission_rate: String(d.commission_rate),
    });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <UserCheck className="w-7 h-7 text-blue-600" /> คนขับ
        </h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> เพิ่มคนขับ
        </button>
      </div>

      {/* Driver Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          <p className="text-slate-400 col-span-2 text-center py-8">กำลังโหลด...</p>
        ) : drivers.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-bold">
                  {d.nickname.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{d.nickname}</h3>
                  <p className="text-slate-500 text-sm">{d.name}</p>
                </div>
              </div>
              <button onClick={() => handleEdit(d)} className="text-blue-400 hover:text-blue-600">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">ทะเบียนรถ</p>
                <p className="font-semibold text-slate-700">{d.license_plate}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">เลขบัญชี</p>
                <p className="font-semibold text-slate-700 text-xs">{d.bank_account || '-'}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">เงินเดือน</p>
                <p className="font-bold text-green-700">{formatCurrency(d.base_salary)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">ประกันสังคม</p>
                <p className="font-bold text-orange-700">{formatCurrency(d.social_security)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-slate-400 mb-1">อัตราค่ารอบ</p>
                <p className="font-bold text-blue-700">{(d.commission_rate * 100).toFixed(0)}% ของราคาค่าขนส่ง</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] p-6 animate-fade-in-up">
            <h3 className="font-bold text-lg mb-5">{editing ? 'แก้ไขข้อมูลคนขับ' : 'เพิ่มคนขับใหม่'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">ชื่อจริง-นามสกุล *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="form-input" /></div>
                <div><label className="form-label">ชื่อเล่น *</label>
                  <input required value={form.nickname} onChange={e => setForm(f => ({...f, nickname: e.target.value}))} className="form-input" /></div>
              </div>
              <div><label className="form-label">รหัสคนขับ (driver_key) *</label>
                <input required value={form.driver_key} onChange={e => setForm(f => ({...f, driver_key: e.target.value}))} className="form-input" placeholder="เช่น jong, phoom" /></div>
              <div><label className="form-label">ทะเบียนรถ *</label>
                <input required value={form.license_plate} onChange={e => setForm(f => ({...f, license_plate: e.target.value}))} className="form-input" /></div>
              <div><label className="form-label">เลขบัญชีธนาคาร</label>
                <input value={form.bank_account} onChange={e => setForm(f => ({...f, bank_account: e.target.value}))} className="form-input" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="form-label">เงินเดือน (บาท)</label>
                  <input type="number" value={form.base_salary} onChange={e => setForm(f => ({...f, base_salary: e.target.value}))} className="form-input" /></div>
                <div><label className="form-label">ประกันสังคม</label>
                  <input type="number" value={form.social_security} onChange={e => setForm(f => ({...f, social_security: e.target.value}))} className="form-input" /></div>
                <div><label className="form-label">อัตราค่ารอบ</label>
                  <input type="number" step="0.01" value={form.commission_rate} onChange={e => setForm(f => ({...f, commission_rate: e.target.value}))} className="form-input" placeholder="0.10" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
