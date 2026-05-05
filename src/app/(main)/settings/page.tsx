'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Save, RefreshCw, Plus, X, MessageCircle, CheckCircle2, Clock, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { COMPANY } from '@/lib/constants';

export default function SettingsPage() {
  const supabase = createClient();
  const [products,  setProducts]  = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newProduct,  setNewProduct]  = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  const [managerLineId,       setManagerLineId]       = useState('');
  const [lineIdSaved,         setLineIdSaved]         = useState(false);
  const [defaultAdvanceLimit, setDefaultAdvanceLimit] = useState('5000');
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [summaryTime, setSummaryTime] = useState('21:00');
  const [summaryLineId, setSummaryLineId] = useState('');
  const [summarySending, setSummarySending] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('app_settings')
        .select('*').in('setting_key', [
          'product_categories', 'locations',
          'manager_line_user_id', 'default_advance_limit',
          'daily_summary_enabled', 'daily_summary_time', 'daily_summary_line_id',
        ]);
      data?.forEach(row => {
        if (row.setting_key === 'product_categories')    setProducts(row.setting_value as string[]);
        if (row.setting_key === 'locations')             setLocations(row.setting_value as string[]);
        if (row.setting_key === 'manager_line_user_id')  setManagerLineId(row.setting_value as string || '');
        if (row.setting_key === 'default_advance_limit') setDefaultAdvanceLimit(String(row.setting_value || 5000));
        if (row.setting_key === 'daily_summary_enabled') setSummaryEnabled(row.setting_value === true || row.setting_value === 'true');
        if (row.setting_key === 'daily_summary_time') setSummaryTime(String(row.setting_value || '21:00'));
        if (row.setting_key === 'daily_summary_line_id') setSummaryLineId(String(row.setting_value || ''));
      });
      setLoading(false);
    };
    load();
  }, []);

  const save = async (key: string, value: string[] | string | number) => {
    setSaving(true);
    await supabase.from('app_settings').upsert({ setting_key: key, setting_value: value });
    setSaving(false);
  };

  const saveManagerLineId = async () => {
    await save('manager_line_user_id', managerLineId.trim());
    setLineIdSaved(true);
    setTimeout(() => setLineIdSaved(false), 2000);
  };

  const saveAdvanceLimit = async () => {
    const num = parseInt(defaultAdvanceLimit, 10);
    if (!isNaN(num) && num > 0) await save('default_advance_limit', num);
  };

  const addProduct = async () => {
    const trimmed = newProduct.trim();
    if (!trimmed || products.includes(trimmed)) return;
    const updated = [...products, trimmed];
    setProducts(updated);
    setNewProduct('');
    await save('product_categories', updated);
  };

  const removeProduct = async (p: string) => {
    const updated = products.filter(x => x !== p);
    setProducts(updated);
    await save('product_categories', updated);
  };

  const addLocation = async () => {
    const trimmed = newLocation.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed];
    setLocations(updated);
    setNewLocation('');
    await save('locations', updated);
  };

  const removeLocation = async (l: string) => {
    const updated = locations.filter(x => x !== l);
    setLocations(updated);
    await save('locations', updated);
  };

  const sendTestSummary = async () => {
    setSummarySending(true);
    try {
      await fetch('/api/line/daily-summary', { method: 'POST', headers: { 'x-internal-key': process.env.NEXT_PUBLIC_APP_URL || '' } });
    } catch {}
    setSummarySending(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Settings className="w-7 h-7 text-blue-600" />
        <span>ตั้งค่าระบบ</span>
      </h1>

      {/* Company Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4">ข้อมูลบริษัท</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="form-label">ชื่อบริษัท</label>
            <input value={COMPANY.name} readOnly className="form-input bg-slate-50" />
          </div>
          <div>
            <label className="form-label">ที่อยู่</label>
            <input value={COMPANY.address} readOnly className="form-input bg-slate-50" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">* แก้ไขได้ที่ไฟล์ src/lib/constants.ts</p>
      </div>

      {/* Product Categories */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4">ประเภทสินค้า</h2>
        <div className="flex gap-2 mb-4">
          <input
            value={newProduct}
            onChange={e => setNewProduct(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addProduct())}
            className="form-input flex-1"
            placeholder="พิมพ์ชื่อสินค้าแล้วกด Enter หรือปุ่ม +"
          />
          <button onClick={addProduct} className="btn-primary px-3">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {products.map(p => (
            <span key={p} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm">
              {p}
              <button onClick={() => removeProduct(p)} className="text-blue-400 hover:text-blue-700 ml-1">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Locations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4">รายชื่อสถานที่</h2>
        <div className="flex gap-2 mb-4">
          <input
            value={newLocation}
            onChange={e => setNewLocation(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLocation())}
            className="form-input flex-1"
            placeholder="พิมพ์ชื่อจังหวัด/สถานที่แล้วกด Enter หรือปุ่ม +"
          />
          <button onClick={addLocation} className="btn-primary px-3">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {locations.map(l => (
            <span key={l} className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm">
              {l}
              <button onClick={() => removeLocation(l)} className="text-green-400 hover:text-green-700 ml-1">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* LINE Bot Settings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-500" />
          <span>ตั้งค่า LINE Bot</span>
        </h2>
        <div className="space-y-4">
          <div>
            <label className="form-label">LINE User ID ของผู้จัดการ (รับแจ้งเตือน)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={managerLineId}
                onChange={e => setManagerLineId(e.target.value)}
                className="form-input flex-1"
                placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <button onClick={saveManagerLineId} className="btn-primary px-4 flex items-center gap-1.5">
                {lineIdSaved
                  ? <><CheckCircle2 className="w-4 h-4" /><span>บันทึกแล้ว</span></>
                  : <><Save className="w-4 h-4" /><span>บันทึก</span></>
                }
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">ส่งข้อความหา Bot แล้ว log เพื่อดู User ID</p>
          </div>

          <div>
            <label className="form-label">วงเงินเบิกต่อเดือน (บาท)</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={defaultAdvanceLimit}
                onChange={e => setDefaultAdvanceLimit(e.target.value)}
                className="form-input w-40"
                min="0" step="500"
              />
              <button onClick={saveAdvanceLimit} className="btn-secondary text-sm flex items-center gap-1.5">
                <Save className="w-4 h-4" /><span>บันทึก</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">ค่าเริ่มต้นสำหรับคนขับทุกคน</p>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">คำสั่ง LINE ที่รองรับ</p>
            <div className="space-y-1.5 font-mono text-xs text-slate-700">
              <div className="bg-white rounded px-3 py-2 border border-slate-200">
                <span className="text-green-600 font-bold">!เบิก</span>{' '}
                <span className="text-blue-600">[คนขับ]</span>{' '}
                <span className="text-orange-600">[จำนวน]</span>{' '}[เหตุผล]
                <span className="text-slate-400 ml-2">— เช่น: !เบิก จง 2000 ค่าข้าว</span>
              </div>
              <div className="bg-white rounded px-3 py-2 border border-slate-200">
                <span className="text-green-600 font-bold">!เติมน้ำมัน</span>{' '}
                <span className="text-blue-600">[คนขับ]</span>
                <span className="text-slate-400 ml-2">— เช่น: !เติมน้ำมัน จง</span>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Daily LINE Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-violet-500" />
          <span>สรุปประจำวัน (LINE)</span>
        </h2>
        <div className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">เปิดการส่งสรุปอัตโนมัติ</p>
              <p className="text-xs text-slate-400 mt-0.5">ส่งสรุปงาน รายได้ และแจ้งเตือนให้ผู้จัดการทุกคืน</p>
            </div>
            <button
              onClick={async () => {
                const next = !summaryEnabled;
                setSummaryEnabled(next);
                await save('daily_summary_enabled', next ? 'true' : 'false');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${summaryEnabled ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {summaryEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {summaryEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
            </button>
          </div>

          {/* Time */}
          <div className="flex items-center gap-3">
            <div>
              <label className="form-label">เวลาส่งสรุป</label>
              <input type="time" className="form-input w-32" value={summaryTime}
                onChange={e => setSummaryTime(e.target.value)} />
            </div>
            <button onClick={() => save('daily_summary_time', summaryTime)}
              className="btn-secondary text-sm flex items-center gap-1.5 mt-5">
              <Save className="w-4 h-4" /> บันทึก
            </button>
          </div>

          {/* Preview */}
          <div className="bg-slate-800 rounded-xl p-4 text-sm font-mono text-green-300 leading-relaxed">
            <div className="text-slate-400 text-xs mb-2">ตัวอย่างข้อความที่จะส่ง:</div>
            <div>📊 สรุปประจำวัน — {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}</div>
            <div className="mt-1">🚛 งานวันนี้: 4 งาน · กำลังวิ่ง 2 คัน</div>
            <div>💰 รายได้วันนี้: ฿48,000</div>
            <div>⛽ รอตรวจน้ำมัน: 2 รายการ</div>
            <div>⚠️ ลูกค้าค้างชำระ: 1 ราย</div>
          </div>

          {/* Test Send */}
          <button onClick={sendTestSummary} disabled={summarySending}
            className="btn-secondary text-sm flex items-center gap-1.5">
            {summarySending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> กำลังส่ง...</>
              : <><Send className="w-4 h-4" /> ส่งทดสอบตอนนี้</>}
          </button>
        </div>
      </div>

      {saving && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /><span>กำลังบันทึก...</span>
        </div>
      )}
    </div>
  );
}
