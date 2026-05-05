'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Pencil, Users, Phone, MapPin, CreditCard } from 'lucide-react';
import type { Customer } from '@/types';
import { PAYMENT_TYPE_LABELS } from '@/lib/constants';
import { formatThaiDate } from '@/lib/utils';

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', address: '',
    payment_type: 'on_completion' as Customer['payment_type'],
    credit_days: '', notes: '',
  });

  const load = async () => {
    const { data } = await supabase.from('customers').select('*').is('deleted_at', null).order('name');
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      credit_days: form.credit_days ? Number(form.credit_days) : null,
    };
    if (editing) {
      await supabase.from('customers').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert(payload);
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name:'', contact_person:'', phone:'', address:'', payment_type:'on_completion', credit_days:'', notes:'' });
    load();
  };

  const handleEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name:          c.name,
      contact_person: c.contact_person || '',
      phone:         c.phone || '',
      address:       c.address || '',
      payment_type:  c.payment_type,
      credit_days:   c.credit_days ? String(c.credit_days) : '',
      notes:         c.notes || '',
    });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-7 h-7 text-blue-600" /> ลูกค้า
        </h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> เพิ่มลูกค้าใหม่
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] p-6 animate-fade-in-up">
            <h3 className="font-bold text-lg mb-5">{editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="form-label">ชื่อลูกค้า *</label>
                <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="form-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">ผู้ติดต่อ</label>
                  <input value={form.contact_person} onChange={e => setForm(f => ({...f, contact_person: e.target.value}))} className="form-input" /></div>
                <div><label className="form-label">เบอร์โทร</label>
                  <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} className="form-input" /></div>
              </div>
              <div><label className="form-label">ที่อยู่</label>
                <input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} className="form-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">ประเภทการชำระ</label>
                  <select value={form.payment_type} onChange={e => setForm(f => ({...f, payment_type: e.target.value as any}))} className="form-input">
                    <option value="prepaid">จ่ายล่วงหน้า</option>
                    <option value="on_completion">จ่ายเมื่อส่งงาน</option>
                    <option value="credit">เครดิต</option>
                  </select></div>
                {form.payment_type === 'credit' && (
                  <div><label className="form-label">เครดิต (วัน)</label>
                    <input type="number" value={form.credit_days} onChange={e => setForm(f => ({...f, credit_days: e.target.value}))} className="form-input" placeholder="30" /></div>
                )}
              </div>
              <div><label className="form-label">หมายเหตุ</label>
                <input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="form-input" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
                <button type="submit" className="btn-primary">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th>ชื่อลูกค้า</th>
              <th>ผู้ติดต่อ</th>
              <th>เบอร์โทร</th>
              <th>ประเภทชำระ</th>
              <th>หมายเหตุ</th>
              <th className="text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">กำลังโหลด...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">ยังไม่มีข้อมูลลูกค้า</td></tr>
            ) : (
              customers.map(c => (
                <tr key={c.id}>
                  <td className="font-medium text-slate-900">{c.name}</td>
                  <td>{c.contact_person || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${c.payment_type === 'prepaid' ? 'bg-green-100 text-green-700' :
                        c.payment_type === 'credit'  ? 'bg-orange-100 text-orange-700' :
                                                       'bg-blue-100 text-blue-700'}`}>
                      {PAYMENT_TYPE_LABELS[c.payment_type]}
                      {c.credit_days ? ` (${c.credit_days} วัน)` : ''}
                    </span>
                  </td>
                  <td className="text-slate-400 text-xs">{c.notes || '-'}</td>
                  <td className="text-center">
                    <button onClick={() => handleEdit(c)} className="text-blue-400 hover:text-blue-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
