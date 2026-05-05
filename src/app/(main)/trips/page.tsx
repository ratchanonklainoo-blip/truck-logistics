'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import TripForm from '@/components/trips/TripForm';
import TripTable from '@/components/trips/TripTable';
import {
  Truck, Users, Calendar, Download, Upload as UploadIcon,
  Building2, TrendingUp, Fuel, DollarSign, Settings,
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
            <Download className="w-4 h-4" /> CSV
          </button>
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
