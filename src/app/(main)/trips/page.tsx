'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import TripForm from '@/components/trips/TripForm';
import TripTable from '@/components/trips/TripTable';
import {
  Truck, Users, Calendar, Download, Upload as UploadIcon,
  Building2, TrendingUp, Fuel, DollarSign, Settings,
  FileUp, AlertCircle, CheckCircle2, X, Loader2,
} from 'lucide-react';
import type { Driver, Trip, TripFormData, AppSettings, MonthFilter } from '@/types';
import {
  COMPANY, THAI_MONTHS, BUDDHIST_ERA_OFFSET,
  DEFAULT_PRODUCT_CATEGORIES, DEFAULT_LOCATIONS,
} from '@/lib/constants';
import {
  calculateTotals, calcNetPay, calcFuelEfficiency,
  isDateInFilter, getCurrentMonthFilter, getThaiMonthLabel,
  formatCurrency, formatNumber, escapeCsvField,
} from '@/lib/utils';

export default function TripsPage() {
  const supabase = createClient();

  const [drivers,         setDrivers]         = useState<Driver[]>([]);
  const [allTrips,        setAllTrips]         = useState<Trip[]>([]);
  const [selectedDriver,  setSelectedDriver]   = useState<Driver | null>(null);
  const [monthFilter,     setMonthFilter]      = useState<MonthFilter>(getCurrentMonthFilter());
  const [loading,         setLoading]          = useState(true);
  const [editingTrip,     setEditingTrip]      = useState<(TripFormData & { id: string }) | null>(null);
  const [products,        setProducts]         = useState<string[]>(DEFAULT_PRODUCT_CATEGORIES);
  const [locations,       setLocations]        = useState<string[]>(DEFAULT_LOCATIONS);
  const [initialOdometer, setInitialOdometer]  = useState(0);
  const [showOdoSettings, setShowOdoSettings]  = useState(false);
  const [tempOdo,         setTempOdo]          = useState('');

  // ── Load drivers ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at');
      if (data && data.length > 0) {
        setDrivers(data);
        setSelectedDriver(data[0]);
      }
    };
    load();
  }, []);

  // ── Load app settings ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .in('setting_key', ['product_categories', 'locations', 'initial_odometers']);
      if (data) {
        data.forEach(row => {
          if (row.setting_key === 'product_categories') setProducts(row.setting_value as string[]);
          if (row.setting_key === 'locations')          setLocations(row.setting_value as string[]);
          if (row.setting_key === 'initial_odometers' && selectedDriver) {
            const odometers = row.setting_value as Record<string, number>;
            setInitialOdometer(odometers[selectedDriver.driver_key] || 0);
          }
        });
      }
    };
    load();
  }, [selectedDriver]);

  // ── Realtime subscription ────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const fetchTrips = async () => {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .is('deleted_at', null)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });
      setAllTrips(data || []);
      setLoading(false);
    };
    fetchTrips();

    const channel = supabase
      .channel('trips-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Filtered trips ────────────────────────────────────────
  const currentDriverTrips = useMemo(() => {
    if (!selectedDriver) return [];
    return allTrips.filter(t =>
      t.driver_id === selectedDriver.id &&
      isDateInFilter(t.date, monthFilter),
    );
  }, [allTrips, selectedDriver, monthFilter]);

  const allMonthTrips = useMemo(() =>
    allTrips.filter(t => isDateInFilter(t.date, monthFilter)),
  [allTrips, monthFilter]);

  const driverTotals = useMemo(() => calculateTotals(currentDriverTrips), [currentDriverTrips]);

  const companyStats = useMemo(() => {
    const totalRevenue = allMonthTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
    const totalTripPay = allMonthTrips.reduce((s, t) => s + (t.trip_pay || 0), 0);
    const totalFuel    = allMonthTrips.reduce((s, t) => s + (t.fuel_cost || 0), 0);
    const totalOther   = allMonthTrips.reduce((s, t) => s + (t.other_cost || 0), 0);
    const activeDrivers = new Set(allMonthTrips.map(t => t.driver_id)).size || 2;
    const totalSalaries = activeDrivers * (selectedDriver?.base_salary || 5000);
    const totalExpenses = totalTripPay + totalFuel + totalOther + totalSalaries;
    return { totalRevenue, totalTripPay, totalFuel, totalOther, totalSalaries, totalExpenses, netProfit: totalRevenue - totalExpenses };
  }, [allMonthTrips, selectedDriver]);

  const driverNetPay = useMemo(() => {
    if (!selectedDriver) return 0;
    return calcNetPay(
      driverTotals.trip_pay,
      selectedDriver.base_salary,
      driverTotals.withdraw,
      selectedDriver.social_security,
    );
  }, [driverTotals, selectedDriver]);

  const avgEfficiency = calcFuelEfficiency(driverTotals.distance, driverTotals.fuel_litres);

  // ── CRUD ──────────────────────────────────────────────────
  const handleSave = useCallback(async (formData: any, id?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      ...formData,
      transport_price: Number(formData.transport_price) || 0,
      trip_pay:        Number(formData.trip_pay)        || 0,
      odometer_start:  Number(formData.odometer_start)  || 0,
      odometer_end:    Number(formData.odometer_end)    || 0,
      distance:        Number(formData.distance)        || 0,
      fuel_cost:       Number(formData.fuel_cost)       || 0,
      fuel_litres:     Number(formData.fuel_litres)     || 0,
      other_cost:      Number(formData.other_cost)      || 0,
      withdraw:        Number(formData.withdraw)        || 0,
      created_by:      user?.id,
    };

    if (id) {
      await supabase.from('trips').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
    } else {
      await supabase.from('trips').insert(payload);
    }
    setEditingTrip(null);
  }, [supabase]);

  const handleDelete = useCallback(async (trip: Trip) => {
    await supabase.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', trip.id);
  }, [supabase]);

  const handleEdit = useCallback((trip: Trip) => {
    setEditingTrip({ ...trip } as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── Add product/location to settings ─────────────────────
  const handleAddProduct = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || products.includes(trimmed)) return;
    const updated = [...products, trimmed];
    setProducts(updated);
    await supabase.from('app_settings')
      .upsert({ setting_key: 'product_categories', setting_value: updated });
  }, [products, supabase]);

  const handleAddLocation = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed];
    setLocations(updated);
    await supabase.from('app_settings')
      .upsert({ setting_key: 'locations', setting_value: updated });
  }, [locations, supabase]);

  // ── Odometer settings ─────────────────────────────────────
  const handleSaveOdo = async () => {
    const val = Number(tempOdo);
    if (isNaN(val) || !selectedDriver) return;
    setInitialOdometer(val);
    const { data } = await supabase.from('app_settings')
      .select('setting_value').eq('setting_key', 'initial_odometers').single();
    const existing = (data?.setting_value as Record<string, number>) || {};
    await supabase.from('app_settings')
      .upsert({ setting_key: 'initial_odometers', setting_value: { ...existing, [selectedDriver.driver_key]: val } });
    setShowOdoSettings(false);
  };

  // ── CSV Export ────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ['วันที่','คนขับ','สินค้า','น้ำหนัก','ต้นทาง','ปลายทาง',
                     'ไมล์ต้น','ไมล์ปลาย','ระยะ(กม.)','ค่าน้ำมัน','ลิตร',
                     'ค่าขนส่ง','ค่าเที่ยว','เบิก','รายการอื่นๆ','ค่าอื่นๆ','หมายเหตุ'];
    const rows = currentDriverTrips.map(t => [
      t.date, selectedDriver?.name || '',
      escapeCsvField(t.product), escapeCsvField(t.weight),
      escapeCsvField(t.origin), escapeCsvField(t.destination),
      t.odometer_start, t.odometer_end, t.distance,
      t.fuel_cost, t.fuel_litres, t.transport_price, t.trip_pay,
      t.withdraw, escapeCsvField(t.other_item), t.other_cost, escapeCsvField(t.remarks),
    ]);
    const csv = ['﻿' + headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `รายการ_${selectedDriver?.nickname}_${getThaiMonthLabel(monthFilter)}.csv`;
    a.click();
  };

  // ── Import CSV ────────────────────────────────────────────
  const [showImport, setShowImport]       = useState(false);
  const [importRows, setImportRows]       = useState<ImportRow[]>([]);
  const [importing,  setImporting]        = useState(false);
  const [importDone, setImportDone]       = useState<{ ok: number; fail: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type ImportRow = {
    raw: string[];
    date: string;
    product: string;
    weight: string;
    origin: string;
    destination: string;
    odometer_start: number;
    odometer_end: number;
    distance: number;
    fuel_cost: number;
    fuel_litres: number;
    transport_price: number;
    trip_pay: number;
    withdraw: number;
    other_item: string;
    other_cost: number;
    remarks: string;
    errors: string[];
  };

  const parseCSV = (text: string): string[][] => {
    // Remove BOM if present
    const clean = text.replace(/^﻿/, '');
    return clean.split('\n').map(line => {
      const cols: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    }).filter(r => r.some(c => c !== ''));
  };

  const validateDate = (s: string): string => {
    // Accept YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Accept D/M/YYYY or DD/MM/YYYY (BE or CE)
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      let y = Number(parts[2]);
      if (y > 2400) y -= BUDDHIST_ERA_OFFSET; // convert BE → CE
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportDone(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) return;

      // Skip header row
      const dataRows = rows.slice(1);
      const parsed: ImportRow[] = dataRows.map((cols, idx) => {
        const errors: string[] = [];

        const rawDate   = cols[0] || '';
        const date      = validateDate(rawDate);
        if (!date) errors.push(`วันที่ไม่ถูกต้อง: "${rawDate}"`);

        const toNum = (v: string, label: string) => {
          const n = Number(String(v).replace(/,/g, ''));
          if (isNaN(n)) { errors.push(`${label} ไม่ใช่ตัวเลข`); return 0; }
          return n;
        };

        const odometer_start  = toNum(cols[6],  'ไมล์ต้น');
        const odometer_end    = toNum(cols[7],  'ไมล์ปลาย');
        const distance        = toNum(cols[8],  'ระยะทาง');
        const fuel_cost       = toNum(cols[9],  'ค่าน้ำมัน');
        const fuel_litres     = toNum(cols[10], 'ลิตร');
        const transport_price = toNum(cols[11], 'ค่าขนส่ง');
        const trip_pay        = toNum(cols[12], 'ค่าเที่ยว');
        const withdraw        = toNum(cols[13], 'เบิก');
        const other_cost      = toNum(cols[15], 'ค่าอื่นๆ');

        return {
          raw: cols,
          date,
          product:         cols[2]  || '',
          weight:          cols[3]  || '',
          origin:          cols[4]  || '',
          destination:     cols[5]  || '',
          odometer_start,
          odometer_end,
          distance,
          fuel_cost,
          fuel_litres,
          transport_price,
          trip_pay,
          withdraw,
          other_item:      cols[14] || '',
          other_cost,
          remarks:         cols[16] || '',
          errors,
        };
      });

      setImportRows(parsed);
      setShowImport(true);
    };
    reader.readAsText(file, 'utf-8');
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!selectedDriver) return;
    setImporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const validRows = importRows.filter(r => r.errors.length === 0);

    let ok = 0; let fail = 0;
    for (const row of validRows) {
      const { error } = await supabase.from('trips').insert({
        driver_id:       selectedDriver.id,
        date:            row.date,
        product:         row.product,
        weight:          row.weight,
        origin:          row.origin,
        destination:     row.destination,
        odometer_start:  row.odometer_start,
        odometer_end:    row.odometer_end,
        distance:        row.distance,
        fuel_cost:       row.fuel_cost,
        fuel_litres:     row.fuel_litres,
        transport_price: row.transport_price,
        trip_pay:        row.trip_pay,
        withdraw:        row.withdraw,
        other_item:      row.other_item,
        other_cost:      row.other_cost,
        remarks:         row.remarks,
        created_by:      user?.id,
      });
      if (error) fail++; else ok++;
    }

    setImporting(false);
    setImportDone({ ok, fail });
    setImportRows([]);
  };

  const monthLabel = getThaiMonthLabel(monthFilter);
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const now = new Date();
    return now.getFullYear() + BUDDHIST_ERA_OFFSET - i;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="w-7 h-7 text-blue-600" /> เที่ยววิ่ง
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{COMPANY.name}</p>
        </div>
        {/* Month/Year filter */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            className="form-input w-36 text-sm"
            value={monthFilter.month_index}
            onChange={e => setMonthFilter(f => ({ ...f, month_index: Number(e.target.value) }))}
          >
            {THAI_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            className="form-input w-24 text-sm"
            value={monthFilter.year_be}
            onChange={e => setMonthFilter(f => ({ ...f, year_be: Number(e.target.value) }))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Company Summary Bar */}
      <div className="rounded-xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2d5a8e 100%)' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold flex items-center gap-2 text-yellow-400">
            <Building2 className="w-5 h-5" /> สรุปยอดบริษัท — {monthLabel}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Realtime
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'รายรับ (ค่าขนส่ง)', value: companyStats.totalRevenue, color: 'text-green-400' },
            { label: 'ค่าน้ำมันรวม',      value: companyStats.totalFuel,    color: 'text-blue-300' },
            { label: 'ค่าอื่นๆ',           value: companyStats.totalOther,   color: 'text-orange-300' },
            { label: 'รายจ่ายรวม',        value: companyStats.totalExpenses, color: 'text-red-300' },
            { label: 'กำไรสุทธิ',         value: companyStats.netProfit,
              color: companyStats.netProfit >= 0 ? 'text-blue-200' : 'text-red-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/10 rounded-lg p-3">
              <p className="text-slate-300 text-xs mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Driver Selector + Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-600" />
          <select
            className="form-input w-64 font-medium"
            value={selectedDriver?.id || ''}
            onChange={e => setSelectedDriver(drivers.find(d => d.id === e.target.value) || null)}
          >
            {drivers.map(d => (
              <option key={d.id} value={d.id}>
                คนขับ: {d.nickname} ({d.name})
              </option>
            ))}
          </select>
          <div className="text-sm text-slate-500">
            ทะเบียน: <span className="font-medium text-slate-700">{selectedDriver?.license_plate}</span>
          </div>
          <div className="text-sm text-slate-500">
            ไมล์เริ่มต้น: <span className="font-semibold text-blue-700">{formatNumber(initialOdometer)}</span>
            <button
              onClick={() => { setTempOdo(String(initialOdometer)); setShowOdoSettings(true); }}
              className="text-blue-400 hover:text-blue-600 text-xs ml-1 underline"
            >(แก้ไข)</button>
          </div>
        </div>

        {/* Driver stats */}
        <div className="flex gap-4 flex-wrap">
          {[
            { icon: Truck,       label: 'เที่ยว',       value: formatNumber(driverTotals.trips),      color: 'text-blue-600' },
            { icon: Fuel,        label: 'น้ำมัน',       value: formatCurrency(driverTotals.fuel_cost), color: 'text-cyan-600' },
            { icon: TrendingUp,  label: 'ค่าเที่ยว',   value: formatCurrency(driverTotals.trip_pay),  color: 'text-green-600' },
            { icon: DollarSign,  label: 'สุทธิ',        value: formatCurrency(driverNetPay),           color: 'text-indigo-700' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Export/Import */}
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn-secondary text-sm py-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary text-sm py-1.5"
          >
            <FileUp className="w-4 h-4" /> Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Main Grid: Form + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TripForm
            drivers={drivers}
            selectedDriverId={selectedDriver?.id || ''}
            initialOdometer={initialOdometer}
            products={products}
            locations={locations}
            editingTrip={editingTrip}
            onSave={handleSave}
            onCancel={() => setEditingTrip(null)}
            onAddProduct={handleAddProduct}
            onAddLocation={handleAddLocation}
          />
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                รายการ: {selectedDriver?.name} — {monthLabel}
              </h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                {currentDriverTrips.length} รายการ
              </span>
            </div>
            <TripTable
              trips={currentDriverTrips}
              totals={driverTotals}
              loading={loading}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </div>

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-800">Import CSV — เที่ยววิ่ง</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  คนขับ: {selectedDriver?.name}
                </span>
              </div>
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportDone(null); }}
                className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Import Done Banner */}
            {importDone && (
              <div className={`mx-6 mt-4 rounded-lg px-4 py-3 flex items-center gap-2 text-sm font-medium
                ${importDone.fail === 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                นำเข้าสำเร็จ {importDone.ok} รายการ
                {importDone.fail > 0 && ` · ล้มเหลว ${importDone.fail} รายการ`}
              </div>
            )}

            {/* Stats */}
            {importRows.length > 0 && (
              <div className="px-6 pt-4 flex gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-green-700 bg-green-50 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  พร้อม import: {importRows.filter(r => r.errors.length === 0).length} รายการ
                </span>
                {importRows.some(r => r.errors.length > 0) && (
                  <span className="flex items-center gap-1.5 text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    <AlertCircle className="w-4 h-4" />
                    มีปัญหา: {importRows.filter(r => r.errors.length > 0).length} รายการ
                  </span>
                )}
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {importRows.length === 0 && !importDone ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <FileUp className="w-10 h-10 mb-2" />
                  <p>กรุณาเลือกไฟล์ CSV</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="px-2 py-2 text-left border border-slate-200">สถานะ</th>
                      <th className="px-2 py-2 text-left border border-slate-200">วันที่</th>
                      <th className="px-2 py-2 text-left border border-slate-200">สินค้า</th>
                      <th className="px-2 py-2 text-left border border-slate-200">ต้นทาง</th>
                      <th className="px-2 py-2 text-left border border-slate-200">ปลายทาง</th>
                      <th className="px-2 py-2 text-right border border-slate-200">ไมล์ต้น</th>
                      <th className="px-2 py-2 text-right border border-slate-200">ไมล์ปลาย</th>
                      <th className="px-2 py-2 text-right border border-slate-200">ค่าขนส่ง</th>
                      <th className="px-2 py-2 text-right border border-slate-200">ค่าเที่ยว</th>
                      <th className="px-2 py-2 text-right border border-slate-200">น้ำมัน</th>
                      <th className="px-2 py-2 text-left border border-slate-200">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i}
                        className={row.errors.length > 0 ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-2 py-1.5 border border-slate-200">
                          {row.errors.length === 0 ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <div className="flex items-start gap-1">
                              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                              <span className="text-red-600 leading-tight">{row.errors.join(', ')}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200">{row.date || row.raw[0]}</td>
                        <td className="px-2 py-1.5 border border-slate-200">{row.product}</td>
                        <td className="px-2 py-1.5 border border-slate-200">{row.origin}</td>
                        <td className="px-2 py-1.5 border border-slate-200">{row.destination}</td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right">{row.odometer_start.toLocaleString()}</td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right">{row.odometer_end.toLocaleString()}</td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right">{row.transport_price.toLocaleString()}</td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right">{row.trip_pay.toLocaleString()}</td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right">{row.fuel_cost.toLocaleString()}</td>
                        <td className="px-2 py-1.5 border border-slate-200">{row.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                รูปแบบไฟล์: CSV ที่ Export จากระบบนี้ · วันที่รองรับ YYYY-MM-DD และ DD/MM/YYYY (พ.ศ. หรือ ค.ศ.)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowImport(false); setImportRows([]); setImportDone(null); }}
                  className="btn-secondary text-sm"
                >
                  ปิด
                </button>
                {importRows.filter(r => r.errors.length === 0).length > 0 && !importDone && (
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="btn-primary text-sm min-w-[120px] justify-center"
                  >
                    {importing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> กำลัง import...</>
                    ) : (
                      <><FileUp className="w-4 h-4" /> Import {importRows.filter(r => r.errors.length === 0).length} รายการ</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Odometer Settings Modal */}
      {showOdoSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 animate-fade-in-up">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" /> ตั้งค่าไมล์เริ่มต้น
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              คนขับ: <span className="font-medium">{selectedDriver?.name}</span>
            </p>
            <input
              type="number"
              value={tempOdo}
              onChange={e => setTempOdo(e.target.value)}
              className="form-input mb-4"
              placeholder="เลขไมล์เริ่มต้น..."
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowOdoSettings(false)} className="btn-secondary text-sm">
                ยกเลิก
              </button>
              <button onClick={handleSaveOdo} className="btn-primary text-sm">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
