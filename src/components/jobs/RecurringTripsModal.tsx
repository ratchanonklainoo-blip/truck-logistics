'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Check, Edit2, Trash2, Repeat, ChevronRight } from 'lucide-react';
import { calcCommission, safeNumber } from '@/lib/utils';
import { COMMISSION_RATE, DEFAULT_LOCATIONS, DEFAULT_PRODUCT_CATEGORIES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { mergeSuggestions } from '@/lib/suggestions';
import ComboInput from '@/components/ui/ComboInput';
import { addToSettingList } from '@/lib/settingsList';

interface Driver { id: string; name: string; nickname: string; license_plate: string; }
interface RecurringRoute {
  id: string; name: string; origin: string; destination: string;
  product: string; default_transport_price: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyTemplate = { name: '', origin: '', destination: '', product: '', default_transport_price: '' };

export default function RecurringTripsModal({ drivers, onClose }: { drivers: Driver[]; onClose: () => void }) {
  const [routes, setRoutes] = useState<RecurringRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // 'list' = เลือกแม่แบบ, 'use' = กรอกวันที่/ทะเบียน/ค่าเที่ยว, 'edit' = สร้าง/แก้แม่แบบ
  const [view, setView] = useState<'list' | 'use' | 'edit'>('list');
  const [selected, setSelected] = useState<RecurringRoute | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tpl, setTpl] = useState(emptyTemplate);
  const [use, setUse] = useState({ date: today(), driver_id: '', transport_price: '', trip_pay: '' });
  const [tripPayTouched, setTripPayTouched] = useState(false);
  // รายการแนะนำที่ดึงจากระบบ (app_settings + jobs/trips เดิม) — ดึงไม่สำเร็จก็ยังใช้ค่ามาตรฐานได้
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);
  const [knownProducts, setKnownProducts] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recurring-routes');
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'โหลดแม่แบบไม่สำเร็จ'); return; }
      setRoutes(body.data || []);
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const [settings, trips, jobs] = await Promise.all([
          supabase.from('app_settings').select('setting_key,setting_value')
            .in('setting_key', ['product_categories', 'locations']),
          supabase.from('trips').select('origin,destination,product').is('deleted_at', null)
            .order('date', { ascending: false }).limit(1000),
          supabase.from('jobs').select('origin,destination,product').is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(1000),
        ]);
        if (cancelled) return;
        const setting = (key: string): string[] => {
          const v = settings.data?.find(r => r.setting_key === key)?.setting_value;
          return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
        };
        const rows = [...(trips.data ?? []), ...(jobs.data ?? [])] as { origin: string | null; destination: string | null; product: string | null }[];
        setKnownPlaces(mergeSuggestions(setting('locations'), rows.map(r => r.origin), rows.map(r => r.destination)));
        setKnownProducts(mergeSuggestions(setting('product_categories'), rows.map(r => r.product)));
      } catch { /* ใช้รายการมาตรฐานต่อไป */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const placeOptions = useMemo(
    () => mergeSuggestions(DEFAULT_LOCATIONS, knownPlaces, routes.map(r => r.origin), routes.map(r => r.destination)),
    [knownPlaces, routes],
  );
  const productOptions = useMemo(
    () => mergeSuggestions(DEFAULT_PRODUCT_CATEGORIES, knownProducts, routes.map(r => r.product)),
    [knownProducts, routes],
  );

  // เก็บสถานที่/สินค้าที่พิมพ์เองเข้า app_settings (merge ไม่ทับ) ให้ขึ้นในรายการแนะนำทุกหน้าหลังรีหน้า
  const rememberSuggestions = async (origin: string, destination: string, product: string) => {
    const [loc, prod] = await Promise.all([
      addToSettingList(createClient(), 'locations', [origin, destination]),
      addToSettingList(createClient(), 'product_categories', [product]),
    ]);
    if (loc.list) setKnownPlaces(prev => mergeSuggestions(prev, loc.list!));
    if (prod.list) setKnownProducts(prev => mergeSuggestions(prev, prod.list!));
    const err = loc.error || prod.error;
    if (err) setError(`บันทึกแม่แบบแล้ว แต่${err}`);
  };

  const call = async (url: string, method: string, payload?: unknown) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'เกิดข้อผิดพลาด'); return null; }
      return body;
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
      return null;
    } finally { setBusy(false); }
  };

  const openUse = (r: RecurringRoute) => {
    setSelected(r); setError(''); setNotice('');
    const price = r.default_transport_price > 0 ? String(r.default_transport_price) : '';
    setUse({
      date: today(), driver_id: '', transport_price: price,
      trip_pay: price ? String(calcCommission(safeNumber(Number(price)), COMMISSION_RATE)) : '',
    });
    setTripPayTouched(false);
    setView('use');
  };

  const onPriceChange = (v: string) => {
    setUse(p => ({
      ...p, transport_price: v,
      // ค่าเที่ยวคำนวณอัตโนมัติจากค่าขนส่ง (เหมือนฟอร์มเที่ยววิ่ง) จนกว่าผู้ใช้จะแก้เอง
      trip_pay: tripPayTouched ? p.trip_pay : (v ? String(calcCommission(safeNumber(Number(v)), COMMISSION_RATE)) : ''),
    }));
  };

  const submitUse = async () => {
    if (!selected) return;
    if (!use.date) { setError('กรุณาระบุวันที่'); return; }
    if (!use.driver_id) { setError('กรุณาเลือกทะเบียนรถ'); return; }
    if (use.trip_pay === '' || Number(use.trip_pay) < 0 || Number.isNaN(Number(use.trip_pay))) {
      setError('กรุณากรอกค่าเที่ยว (ตัวเลขไม่ติดลบ)'); return;
    }
    const body = await call(`/api/recurring-routes/${selected.id}/trip`, 'POST', {
      date: use.date, driver_id: use.driver_id,
      transport_price: use.transport_price === '' ? 0 : Number(use.transport_price),
      trip_pay: Number(use.trip_pay),
    });
    if (!body) return;
    const d = drivers.find(x => x.id === use.driver_id);
    setNotice(`เพิ่มเที่ยว ${selected.origin} → ${selected.destination} (${d?.license_plate || ''}) ลงหน้าเที่ยววิ่งแล้ว`);
    setView('list');
    await rememberSuggestions(selected.origin, selected.destination, selected.product);
  };

  const openEdit = (r: RecurringRoute | null) => {
    setError(''); setNotice('');
    setEditingId(r?.id ?? null);
    setTpl(r ? {
      name: r.name, origin: r.origin, destination: r.destination, product: r.product,
      default_transport_price: r.default_transport_price ? String(r.default_transport_price) : '',
    } : emptyTemplate);
    setView('edit');
  };

  const submitTemplate = async () => {
    if (!tpl.name.trim() || !tpl.origin.trim() || !tpl.destination.trim()) {
      setError('กรุณากรอกชื่อแม่แบบ ต้นทาง และปลายทาง'); return;
    }
    const body = await call(
      editingId ? `/api/recurring-routes/${editingId}` : '/api/recurring-routes',
      editingId ? 'PATCH' : 'POST', tpl,
    );
    if (!body) return;
    await load();
    setView('list');
    await rememberSuggestions(tpl.origin, tpl.destination, tpl.product);
  };

  const removeTemplate = async (r: RecurringRoute) => {
    if (!confirm(`ลบแม่แบบ "${r.name}"? (เที่ยวที่สร้างไปแล้วไม่ถูกลบ)`)) return;
    const body = await call(`/api/recurring-routes/${r.id}`, 'DELETE');
    if (body) await load();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-indigo-600" />
            {view === 'edit' ? (editingId ? 'แก้ไขแม่แบบ' : 'สร้างแม่แบบเที่ยววิ่งประจำ') : 'เที่ยววิ่งประจำ'}
          </h2>
          <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
          {notice && view === 'list' && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{notice}</div>}

          {view === 'list' && (
            <>
              <p className="text-sm text-slate-500">เลือกแม่แบบ แล้วกรอกวันที่ ทะเบียนรถ และค่าเที่ยว ระบบจะเพิ่มรายการในหน้า &quot;เที่ยววิ่ง&quot; ให้อัตโนมัติ</p>
              {loading ? (
                <div className="flex justify-center py-6"><div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
              ) : routes.length === 0 ? (
                <div className="text-center text-slate-400 py-6 text-sm">ยังไม่มีแม่แบบ — กด &quot;สร้างแม่แบบ&quot; เพื่อเริ่มต้น</div>
              ) : (
                <div className="space-y-2">
                  {routes.map(r => (
                    <div key={r.id} className="border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                      <button onClick={() => openUse(r)} className="flex-1 text-left min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{r.name}</div>
                        <div className="text-sm text-slate-500 flex items-center gap-1 flex-wrap">
                          {r.origin} <ChevronRight className="w-3.5 h-3.5" /> {r.destination}
                          {r.product ? <span className="text-slate-400"> · {r.product}</span> : null}
                          {r.default_transport_price > 0 ? <span className="text-blue-600"> · {r.default_transport_price.toLocaleString('th-TH')} บาท</span> : null}
                        </div>
                      </button>
                      <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="แก้ไขแม่แบบ"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeTemplate(r)} disabled={busy} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50" title="ลบแม่แบบ"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'use' && selected && (
            <>
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <div className="font-semibold text-slate-800">{selected.name}</div>
                <div className="text-slate-500">{selected.origin} → {selected.destination}{selected.product ? ` · ${selected.product}` : ''}</div>
              </div>
              <div>
                <label className="label-text" htmlFor="rt_date">วันที่ *</label>
                <input id="rt_date" type="date" className="form-input" value={use.date} onChange={e => setUse(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="label-text" htmlFor="rt_driver">ทะเบียนรถ *</label>
                <select id="rt_driver" className="form-input" value={use.driver_id} onChange={e => setUse(p => ({ ...p, driver_id: e.target.value }))}>
                  <option value="">- เลือก -</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.license_plate} — {d.nickname || d.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="rt_price">ค่าขนส่ง (บาท)</label>
                  <input id="rt_price" type="number" min={0} className="form-input" value={use.transport_price} onChange={e => onPriceChange(e.target.value)} />
                </div>
                <div>
                  <label className="label-text" htmlFor="rt_pay">ค่าเที่ยว (บาท) *</label>
                  <input id="rt_pay" type="number" min={0} className="form-input" value={use.trip_pay}
                    onChange={e => { setTripPayTouched(true); setUse(p => ({ ...p, trip_pay: e.target.value })); }} />
                </div>
              </div>
              <p className="text-xs text-slate-400">ค่าเที่ยวคำนวณให้อัตโนมัติจากค่าขนส่ง × {COMMISSION_RATE * 100}% (แก้เองได้)</p>
            </>
          )}

          {view === 'edit' && (
            <>
              <div>
                <label className="label-text" htmlFor="rt_name">ชื่อแม่แบบ *</label>
                <input id="rt_name" className="form-input" value={tpl.name} onChange={e => setTpl(p => ({ ...p, name: e.target.value }))} placeholder="เช่น ข้าวโพด พะเยา → เชียงใหม่" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="rt_origin">ต้นทาง *</label>
                  <ComboInput id="rt_origin" value={tpl.origin} options={placeOptions} onChange={v => setTpl(p => ({ ...p, origin: v }))} placeholder="พิมพ์หรือเลือก" />
                </div>
                <div>
                  <label className="label-text" htmlFor="rt_dest">ปลายทาง *</label>
                  <ComboInput id="rt_dest" value={tpl.destination} options={placeOptions} onChange={v => setTpl(p => ({ ...p, destination: v }))} placeholder="พิมพ์หรือเลือก" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="rt_product">สินค้า</label>
                  <ComboInput id="rt_product" value={tpl.product} options={productOptions} onChange={v => setTpl(p => ({ ...p, product: v }))} placeholder="พิมพ์หรือเลือก" />
                </div>
                <div>
                  <label className="label-text" htmlFor="rt_defprice">ค่าขนส่งเริ่มต้น (บาท)</label>
                  <input id="rt_defprice" type="number" min={0} className="form-input" value={tpl.default_transport_price} onChange={e => setTpl(p => ({ ...p, default_transport_price: e.target.value }))} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white p-5 border-t border-slate-100 flex gap-3 justify-end">
          {view === 'list' && (
            <>
              <button onClick={onClose} className="btn-secondary">ปิด</button>
              <button onClick={() => openEdit(null)} className="btn-primary"><Plus className="w-4 h-4" /> สร้างแม่แบบ</button>
            </>
          )}
          {view === 'use' && (
            <>
              <button onClick={() => { setView('list'); setError(''); }} className="btn-secondary">กลับ</button>
              <button onClick={submitUse} disabled={busy} className="btn-primary"><Check className="w-4 h-4" /> เพิ่มเที่ยววิ่ง</button>
            </>
          )}
          {view === 'edit' && (
            <>
              <button onClick={() => { setView('list'); setError(''); }} className="btn-secondary">ยกเลิก</button>
              <button onClick={submitTemplate} disabled={busy} className="btn-primary"><Check className="w-4 h-4" /> บันทึกแม่แบบ</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
