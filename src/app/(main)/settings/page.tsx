'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Save, RefreshCw, Plus, X } from 'lucide-react';
import { COMPANY } from '@/lib/constants';

export default function SettingsPage() {
  const supabase = createClient();
  const [products,  setProducts]  = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newProduct, setNewProduct]   = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('app_settings')
        .select('*').in('setting_key', ['product_categories','locations']);
      data?.forEach(row => {
        if (row.setting_key === 'product_categories') setProducts(row.setting_value as string[]);
        if (row.setting_key === 'locations')          setLocations(row.setting_value as string[]);
      });
      setLoading(false);
    };
    load();
  }, []);

  const save = async (key: string, value: string[]) => {
    setSaving(true);
    await supabase.from('app_settings').upsert({ setting_key: key, setting_value: value });
    setSaving(false);
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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Settings className="w-7 h-7 text-blue-600" /> ตั้งค่าระบบ
      </h1>

      {/* Company Info (read-only) */}
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
        <p className="text-xs text-slate-400 mt-2">* ข้อมูลบริษัทกำหนดในระบบ — แก้ไขได้ที่ไฟล์ src/lib/constants.ts</p>
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

      {saving && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> กำลังบันทึก...
        </div>
      )}
    </div>
  );
}
