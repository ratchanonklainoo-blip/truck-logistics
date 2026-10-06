'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addToSettingList } from '@/lib/settingsList';
import TripForm from '@/components/trips/TripForm';
import TripTable from '@/components/trips/TripTable';
import {
  Truck, Users, Calendar, Download, Upload as UploadIcon,
  Building2, TrendingUp, Fuel, DollarSign, Settings,
  FileUp, AlertCircle, CheckCircle2, X, Loader2,
  Receipt, Plus, Filter, Trash2,
} from 'lucide-react';
import type { Driver, Trip, TripFormData, AppSettings, MonthFilter } from '@/types';
import {
  COMPANY, THAI_MONTHS, BUDDHIST_ERA_OFFSET,
  DEFAULT_PRODUCT_CATEGORIES, DEFAULT_LOCATIONS,
} from '@/lib/constants';
import {
  calculateTotals, calcNetPay, calcFuelEfficiency,
  getCurrentMonthFilter, getThaiMonthLabel,
  formatCurrency, formatNumber, escapeCsvField,
} from '@/lib/utils';
import { todayBangkok, nextMonthStart } from '@/lib/dateTh';
import { fetchAllRows } from '@/lib/fetchAll';
import { sumTripPay, baseForMonth, isCountedDriver } from '@/lib/payrollCalc';

// แปลง error จาก Supabase เป็นข้อความไทยที่ผู้ใช้อ่านเข้าใจ
function friendlySaveError(err: { message?: string; code?: string }): string {
  const msg = err.message || '';
  if (err.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'ไม่มีสิทธิ์บันทึก ลองออกจากระบบแล้วเข้าสู่ระบบใหม่';
  if (/failed to fetch|network|timeout/i.test(msg)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  if (err.code === '23502') return 'ข้อมูลบางช่องที่จำเป็นยังว่างอยู่';
  if (err.code === '22P02' || err.code === '22003') return 'มีช่องตัวเลขที่ค่าไม่ถูกต้อง';
  return `ระบบขัดข้อง (${msg || 'ไม่ทราบสาเหตุ'})`;
}

export default function TripsPage() {
  const supabase = createClient();

  const [drivers,         setDrivers]         = useState<Driver[]>([]);
  const [selectedDriver,  setSelectedDriver]   = useState<Driver | null>(null);
  const [monthFilter,     setMonthFilter]      = useState<MonthFilter>(getCurrentMonthFilter());
  const [loading,         setLoading]          = useState(true);
  const [editingTrip,     setEditingTrip]      = useState<(TripFormData & { id: string }) | null>(null);
  const [products,        setProducts]         = useState<string[]>(DEFAULT_PRODUCT_CATEGORIES);
  const [locations,       setLocations]        = useState<string[]>(DEFAULT_LOCATIONS);
  const [initialOdometer, setInitialOdometer]  = useState(0);
  const [showOdoSettings, setShowOdoSettings]  = useState(false);
  const [tempOdo,         setTempOdo]          = useState('');

  // ── Tab + expenses state ──────────────────────────────────
  const [activeTab, setActiveTab] = useState<'trips' | 'expenses'>('trips');

  interface ExpenseRow {
    id: string; category: string; description: string | null;
    amount: number; date: string; driver_id: string | null; driverName?: string;
  }
  const EXP_CATEGORIES: Record<string, { label: string; bg: string; color: string }> = {
    toll:    { label: 'ค่าทางด่วน', bg: 'bg-blue-100',   color: 'text-blue-700'   },
    repair:  { label: 'ซ่อมบำรุง',  bg: 'bg-red-100',    color: 'text-red-700'    },
    food:    { label: 'ค่าอาหาร',   bg: 'bg-yellow-100', color: 'text-yellow-700' },
    parking: { label: 'ค่าจอด',     bg: 'bg-purple-100', color: 'text-purple-700' },
    other:   { label: 'อื่นๆ',      bg: 'bg-slate-100',  color: 'text-slate-700'  },
  };
  const [expenses,    setExpenses]    = useState<ExpenseRow[]>([]);
  const [expLoading,  setExpLoading]  = useState(false);
  const [expFilter,   setExpFilter]   = useState('all');
  const [showAddExp,  setShowAddExp]  = useState(false);
  const [deletingExp, setDeletingExp] = useState<string | null>(null);
  const [newExp, setNewExp] = useState({
    category: 'toll', description: '', amount: '',
    date: todayBangkok(), driver_id: '',
  });

  // ── Load drivers ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .is('deleted_at', null)
        // รวมคนขับที่ปิดใช้งาน เพื่อดู/แก้เที่ยวเก่าได้ — แต่ไม่ให้เลือกตอนบันทึกเที่ยวใหม่ (formDrivers)
        .order('is_active', { ascending: false })
        .order('created_at');
      const list = (data || []).filter(isCountedDriver); // ปิดใช้งานแบบเก่า (ไม่มี end_date) ไม่แสดงเหมือนเดิม
      if (list.length > 0) {
        setDrivers(list);
        setSelectedDriver(list[0]);
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

  // ── โหลดเฉพาะเดือนที่เลือก + realtime ───────────────────────
  // เดิมดึงทั้งตาราง trips และรีโหลดทั้งตารางทุกครั้งที่มีการเปลี่ยน — ตอนนี้ดึงเฉพาะเดือน:
  //   currentDriverTrips = ทุกคอลัมน์ ของคนขับที่เลือก ; allMonthTrips = คอลัมน์ยอดเงิน ของทุกคนในเดือน (การ์ดสรุปบริษัท)
  const [currentDriverTrips, setCurrentDriverTrips] = useState<Trip[]>([]);
  const [allMonthTrips,      setAllMonthTrips]      = useState<Pick<Trip, 'driver_id' | 'transport_price' | 'trip_pay' | 'fuel_cost' | 'other_cost'>[]>([]);
  const [tripsError,         setTripsError]         = useState('');
  const selectedDriverId = selectedDriver?.id ?? null;
  const monthYm = `${monthFilter.year_be - BUDDHIST_ERA_OFFSET}-${String(monthFilter.month_index + 1).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    const from = `${monthYm}-01`;
    const to   = nextMonthStart(monthYm);
    setLoading(true);

    const fetchMonth = async () => {
      const [mine, month] = await Promise.all([
        selectedDriverId
          ? fetchAllRows<Trip>((a, b) => supabase.from('trips').select('*')
              .is('deleted_at', null).eq('driver_id', selectedDriverId)
              .gte('date', from).lt('date', to)
              .order('date', { ascending: true }).order('created_at', { ascending: true }).order('id')
              .range(a, b))
          : Promise.resolve({ data: [] as Trip[], error: null }),
        fetchAllRows<Pick<Trip, 'driver_id' | 'transport_price' | 'trip_pay' | 'fuel_cost' | 'other_cost'>>((a, b) =>
          supabase.from('trips').select('driver_id,transport_price,trip_pay,fuel_cost,other_cost')
            .is('deleted_at', null).gte('date', from).lt('date', to)
            .order('id').range(a, b)),
      ]);
      if (cancelled) return;
      const err = mine.error || month.error;
      setTripsError(err ? `โหลดเที่ยววิ่งไม่สำเร็จ: ${friendlySaveError(err)} — ลองรีเฟรชหน้า` : '');
      if (!mine.error)  setCurrentDriverTrips(mine.data);
      if (!month.error) setAllMonthTrips(month.data);
      setLoading(false);
    };
    fetchMonth();

    // realtime: โหลดใหม่เฉพาะเมื่อแถวที่เปลี่ยน (ก่อน/หลังแก้) อยู่ในเดือนที่ดูอยู่
    const inMonth = (row: unknown) => {
      const d = (row as { date?: string } | null)?.date;
      return !!d && d >= from && d < to;
    };
    const channel = supabase
      .channel(`trips-realtime-${monthYm}-${selectedDriverId ?? 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, payload => {
        // old มีแค่ id เมื่อ replica identity ไม่ใช่ FULL (UPDATE/DELETE) — รู้ไม่ได้ว่าเดิมอยู่เดือนไหน จึงโหลดเดือนนี้ใหม่
        const oldHasDate = !!payload.old && 'date' in (payload.old as object);
        if (inMonth(payload.new) || inMonth(payload.old) || (payload.eventType !== 'INSERT' && !oldHasDate)) fetchMonth();
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [selectedDriverId, monthYm]);

  const driverTotals = useMemo(() => calculateTotals(currentDriverTrips), [currentDriverTrips]);

  // รายการคนขับในฟอร์ม: เฉพาะที่ใช้งาน (+ คนขับของเที่ยวที่กำลังแก้ ถ้าปิดใช้งานแล้ว)
  const activeDrivers = useMemo(() => drivers.filter(d => d.is_active !== false), [drivers]);
  const formDrivers = useMemo(() => {
    const editingDriver = editingTrip ? drivers.find(d => d.id === editingTrip.driver_id) : undefined;
    return editingDriver && editingDriver.is_active === false ? [...activeDrivers, editingDriver] : activeDrivers;
  }, [drivers, activeDrivers, editingTrip]);
  const formDefaultDriverId = selectedDriver && selectedDriver.is_active !== false
    ? selectedDriver.id : (activeDrivers[0]?.id || '');

  const companyStats = useMemo(() => {
    const totalRevenue = allMonthTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
    const totalTripPay = sumTripPay(allMonthTrips);
    const totalFuel    = allMonthTrips.reduce((s, t) => s + (t.fuel_cost || 0), 0);
    const totalOther   = allMonthTrips.reduce((s, t) => s + (t.other_cost || 0), 0);
    const driversWithTrips = new Set(allMonthTrips.map(t => t.driver_id)).size || 2;
    const totalSalaries = driversWithTrips * (selectedDriver?.base_salary ?? 0);
    const totalExpenses = totalTripPay + totalFuel + totalOther + totalSalaries;
    return { totalRevenue, totalTripPay, totalFuel, totalOther, totalSalaries, totalExpenses, netProfit: totalRevenue - totalExpenses };
  }, [allMonthTrips, selectedDriver]);

  const driverNetPay = useMemo(() => {
    if (!selectedDriver) return 0;
    const base = baseForMonth(selectedDriver, monthYm); // เริ่มกลางเดือน = ไม่มีฐาน/ประกันสังคม
    return calcNetPay(
      driverTotals.trip_pay,
      base.base_salary,
      driverTotals.withdraw,
      base.social_security,
    );
  }, [driverTotals, selectedDriver, monthYm]);

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
      plate:           (formData.plate ?? '').trim() || null, // ทะเบียนต่อเที่ยว ว่าง = null (ใช้ทะเบียนคนขับ)
      created_by:      user?.id,
    };

    // เก็บสถานที่/สินค้าที่พิมพ์เองเข้า app_settings (merge จาก DB ล่าสุด ไม่ทับ) ให้ขึ้นในรายการแนะนำครั้งต่อไป
    const [loc, prod] = await Promise.all([
      addToSettingList(supabase, 'locations', [payload.origin, payload.destination]),
      addToSettingList(supabase, 'product_categories', [payload.product]),
    ]);
    if (loc.list) setLocations(loc.list);
    if (prod.list) setProducts(prod.list);
    if (loc.error || prod.error) alert(`บันทึกเที่ยววิ่งต่อไป แต่${loc.error || prod.error}`);

    const { error } = id
      ? await supabase.from('trips').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
      : await supabase.from('trips').insert(payload);
    if (error) {
      // คงค่าในฟอร์มไว้ (ไม่ล้าง editingTrip) ให้ผู้ใช้กดบันทึกซ้ำได้โดยไม่ต้องกรอกใหม่
      console.error('[Trips] save failed:', error.message);
      alert(`บันทึกเที่ยววิ่งไม่สำเร็จ: ${friendlySaveError(error)}
ข้อมูลในฟอร์มยังอยู่ กดบันทึกอีกครั้งได้`);
      return;
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

  // ฟอร์มเตือนเที่ยวซ้ำ → "แก้แถวเดิม": โหลดแถวนั้น (อาจเป็นของคนขับ/เดือนอื่นที่ไม่ได้แสดงในตาราง) มาเปิดในโหมดแก้ไข
  const handleEditExisting = useCallback(async (tripId: string) => {
    const { data, error } = await supabase.from('trips').select('*').eq('id', tripId).is('deleted_at', null).maybeSingle();
    if (error || !data) {
      alert(`เปิดแถวเดิมไม่สำเร็จ: ${error ? friendlySaveError(error) : 'ไม่พบรายการ (อาจถูกลบแล้ว)'}`);
      return;
    }
    handleEdit(data as Trip);
  }, [supabase, handleEdit]);

  // ── Add product/location to settings ─────────────────────
  const handleAddProduct = useCallback(async (name: string) => {
    const r = await addToSettingList(supabase, 'product_categories', [name]);
    if (r.list) setProducts(r.list); else alert(r.error);
  }, [supabase]);

  const handleAddLocation = useCallback(async (name: string) => {
    const r = await addToSettingList(supabase, 'locations', [name]);
    if (r.list) setLocations(r.list); else alert(r.error);
  }, [supabase]);

  // ── Odometer settings ─────────────────────────────────────
  const handleSaveOdo = async () => {
    const val = Number(tempOdo);
    if (isNaN(val) || !selectedDriver) return;
    setInitialOdometer(val);
    const { data } = await supabase.from('app_settings')
      .select('setting_value').eq('setting_key', 'initial_odometers').single();
    const existing = (data?.setting_value as Record<string, number>) || {};
    await supabase.from('app_settings')
      .upsert(
        { setting_key: 'initial_odometers', setting_value: { ...existing, [selectedDriver.driver_key]: val } },
        { onConflict: 'setting_key' },
      );
    setShowOdoSettings(false);
  };

  // ── CSV Export ────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ['วันที่','คนขับ','สินค้า','น้ำหนัก','ต้นทาง','ปลายทาง',
                     'ไมล์ต้น','ไมล์ปลาย','ระยะ(กม.)','ค่าน้ำมัน','ลิตร',
                     'ค่าขนส่ง','ค่าเที่ยว','เบิก','รายการอื่นๆ','ค่าอื่นๆ','หมายเหตุ','ทะเบียน'];
    const rows = currentDriverTrips.map(t => [
      t.date, selectedDriver?.name || '',
      escapeCsvField(t.product), escapeCsvField(t.weight),
      escapeCsvField(t.origin), escapeCsvField(t.destination),
      t.odometer_start, t.odometer_end, t.distance,
      t.fuel_cost, t.fuel_litres, t.transport_price, t.trip_pay,
      t.withdraw, escapeCsvField(t.other_item), t.other_cost, escapeCsvField(t.remarks),
      // คอลัมน์ท้ายสุด (นำเข้า CSV อ่านถึงคอลัมน์หมายเหตุ ไม่กระทบ): trips.plate ถ้ามี ไม่มีใช้ทะเบียนคนขับ
      escapeCsvField(t.plate || selectedDriver?.license_plate || ''),
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
        // ค่าเที่ยวห้ามว่าง (0 ได้ ต้องพิมพ์ 0) — เดิม Number('') = 0 ทำให้ช่องว่างกลายเป็น 0 เงียบๆ
        if ((cols[12] ?? '').trim() === '') errors.push('ค่าเที่ยวว่าง (ไม่จ่ายให้ใส่ 0)');
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

  // ── Expenses functions ───────────────────────────────────
  const loadExpenses = async () => {
    setExpLoading(true);
    const yr  = monthFilter.year_be - 543;
    const mo  = String(monthFilter.month_index + 1).padStart(2, '0');
    // ขอบบน = วันแรกของเดือนถัดไป (.lt) ไม่ใช้ YYYY-MM-31 เพราะเดือนที่ไม่มีวันที่ 31 ทำให้ Postgres ตอบ date ไม่ถูกต้อง (เช่น 2026-09-31)
    const nextYr = monthFilter.month_index === 11 ? yr + 1 : yr;
    const nextMo = String(((monthFilter.month_index + 1) % 12) + 1).padStart(2, '0');
    const { data, error } = await supabase.from('expenses')
      .select('id,category,description,amount,date,driver_id')
      .not('category', 'in', '("fuel","advance")')
      .is('deleted_at', null)
      .gte('date', `${yr}-${mo}-01`)
      .lt('date', `${nextYr}-${nextMo}-01`)
      .order('date', { ascending: false });
    if (error) {
      console.error('[Trips] loadExpenses failed:', error.message);
      alert(`โหลดรายการค่าใช้จ่ายอื่นไม่สำเร็จ: ${friendlySaveError(error)}`);
      setExpLoading(false);
      return;
    }
    const drMap: Record<string, string> = {};
    drivers.forEach(d => { drMap[d.id] = d.nickname; });
    setExpenses((data || []).map(e => ({ ...e, driverName: e.driver_id ? (drMap[e.driver_id] || '-') : '-' })));
    setExpLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'expenses' && drivers.length > 0) loadExpenses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, monthFilter, drivers.length]);

  const filteredExp = expFilter === 'all' ? expenses : expenses.filter(e => e.category === expFilter);
  const expTotal    = filteredExp.reduce((s, e) => s + e.amount, 0);

  const saveExpense = async () => {
    if (!newExp.amount || isNaN(Number(newExp.amount))) return;
    const { error } = await supabase.from('expenses').insert({
      category:    newExp.category,
      description: newExp.description || null,
      amount:      Number(newExp.amount),
      date:        newExp.date,
      driver_id:   newExp.driver_id || null,
    });
    if (error) {
      console.error('[Trips] saveExpense failed:', error.message);
      alert(`บันทึกค่าใช้จ่ายไม่สำเร็จ: ${friendlySaveError(error)}`);
      return;
    }
    setShowAddExp(false);
    setNewExp({ category: 'toll', description: '', amount: '', date: todayBangkok(), driver_id: '' });
    await loadExpenses();
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    setDeletingExp(id);
    await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    setDeletingExp(null);
    await loadExpenses();
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
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Truck className="w-7 h-7 text-blue-600" /> เที่ยววิ่ง
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">{COMPANY.name}</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setActiveTab('trips')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'trips' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              เที่ยววิ่ง
            </button>
            <button onClick={() => setActiveTab('expenses')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'expenses' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Receipt className="w-3.5 h-3.5" /> ค่าใช้จ่ายอื่น
            </button>
          </div>
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

      {activeTab === 'trips' && <>
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

      {/* Driver Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <select
              className="form-input font-semibold text-slate-800 flex-1 min-w-0"
              value={selectedDriver?.id || ''}
              onChange={e => setSelectedDriver(drivers.find(d => d.id === e.target.value) || null)}
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.nickname} — {d.name}{d.is_active === false ? ' (ปิดใช้งาน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4 text-sm flex-shrink-0">
            <div className="text-slate-500">
              ทะเบียน: <span className="font-semibold text-slate-800">{selectedDriver?.license_plate || '—'}</span>
            </div>
            <div className="text-slate-500">
              ไมล์เริ่มต้น: <span className="font-semibold text-blue-700">{formatNumber(initialOdometer)}</span>
              <button
                onClick={() => { setTempOdo(String(initialOdometer)); setShowOdoSettings(true); }}
                className="ml-1 text-blue-400 hover:text-blue-600 text-xs underline"
              >(แก้ไข)</button>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handleExportCSV} className="btn-secondary text-sm py-1.5">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-sm py-1.5">
              <FileUp className="w-4 h-4" /> Import
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        {/* Driver KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-0 divide-x divide-y divide-slate-100">
          {/* จำนวนเที่ยว */}
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Truck className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs text-slate-400 font-medium">จำนวนเที่ยว</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatNumber(driverTotals.trips)}</p>
            <p className="text-xs text-slate-400 mt-0.5">เที่ยว</p>
          </div>

          {/* ระยะทาง */}
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs text-slate-400 font-medium">ระยะทาง</p>
            </div>
            <p className="text-2xl font-bold text-slate-700">{formatNumber(driverTotals.distance)}</p>
            <p className="text-xs text-slate-400 mt-0.5">กม.</p>
          </div>

          {/* อัตราสิ้นเปลือง */}
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Fuel className="w-3.5 h-3.5 text-cyan-400" />
              <p className="text-xs text-slate-400 font-medium">อัตราสิ้นเปลือง</p>
            </div>
            <p className="text-2xl font-bold text-cyan-600">
              {avgEfficiency > 0 ? avgEfficiency.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">กม./ลิตร</p>
          </div>

          {/* ค่าน้ำมัน */}
          <div className="p-4 text-center bg-red-50/40">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Fuel className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs text-red-400 font-medium">ค่าน้ำมัน</p>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(driverTotals.fuel_cost)}</p>
            <p className="text-xs text-slate-400 mt-0.5">บาท</p>
          </div>

          {/* น้ำมันรวม (ลิตร) */}
          <div className="p-4 text-center bg-amber-50/40">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Fuel className="w-3.5 h-3.5 text-amber-500" />
              <p className="text-xs text-amber-500 font-medium">น้ำมันรวม</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">
              {driverTotals.fuel_litres > 0 ? formatNumber(driverTotals.fuel_litres, 1) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">ลิตร</p>
          </div>

          {/* ค่าเที่ยว */}
          <div className="p-4 text-center bg-green-50/40">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-green-500" />
              <p className="text-xs text-green-500 font-medium">ค่าเที่ยว</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(driverTotals.trip_pay)}</p>
            <p className="text-xs text-slate-400 mt-0.5">ค่าคอมมิชชั่น</p>
          </div>

          {/* เงินสุทธิ */}
          <div className="p-4 text-center bg-indigo-50/60 rounded-br-2xl">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
              <p className="text-xs text-indigo-500 font-semibold">เงินสุทธิ</p>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{formatCurrency(driverNetPay)}</p>
            <p className="text-xs text-slate-400 mt-0.5">หลังหักทุกอย่าง</p>
          </div>
        </div>
      </div>

      {tripsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{tripsError}</div>
      )}

      {/* Main Grid: Form + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TripForm
            drivers={formDrivers}
            selectedDriverId={formDefaultDriverId}
            initialOdometer={initialOdometer}
            products={products}
            locations={locations}
            editingTrip={editingTrip}
            onSave={handleSave}
            onCancel={() => setEditingTrip(null)}
            onAddProduct={handleAddProduct}
            onAddLocation={handleAddLocation}
            onEditExisting={handleEditExisting}
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

      </>}

      {/* ── EXPENSES TAB ─────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
            <Filter className="w-4 h-4 text-slate-400" />
            <select className="form-input text-sm w-44" value={expFilter} onChange={e => setExpFilter(e.target.value)}>
              <option value="all">ทุกประเภท</option>
              {Object.entries(EXP_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <span className="text-sm text-slate-500">{filteredExp.length} รายการ · รวม {formatCurrency(expTotal)}</span>
            <div className="ml-auto flex gap-2">
              <button onClick={loadExpenses} className="btn-secondary text-sm p-2" title="รีเฟรช">
                <Receipt className="w-4 h-4" />
              </button>
              <button onClick={() => setShowAddExp(true)} className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> เพิ่มค่าใช้จ่าย
              </button>
            </div>
          </div>

          {/* Expenses table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {expLoading ? (
              <div className="p-12 flex justify-center">
                <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : filteredExp.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p>ไม่พบรายการค่าใช้จ่าย</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['วันที่', 'ประเภท', 'รายละเอียด', 'คนขับ', 'จำนวน', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExp.map(e => {
                    const cat = EXP_CATEGORIES[e.category] || EXP_CATEGORIES.other;
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.color}`}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{e.description || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{e.driverName || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(e.amount)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteExpense(e.id)}
                            disabled={deletingExp === e.id}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-600">รวมค่าใช้จ่าย</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(expTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-orange-500" /> เพิ่มค่าใช้จ่าย
              </h3>
              <button onClick={() => setShowAddExp(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">ประเภท</label>
                <select className="form-input" value={newExp.category}
                  onChange={e => setNewExp(f => ({ ...f, category: e.target.value }))}>
                  {Object.entries(EXP_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">รายละเอียด</label>
                <input type="text" className="form-input" value={newExp.description}
                  onChange={e => setNewExp(f => ({ ...f, description: e.target.value }))}
                  placeholder="ระบุรายละเอียด..." />
              </div>
              <div>
                <label className="form-label">จำนวนเงิน (บาท)</label>
                <input type="number" className="form-input" value={newExp.amount}
                  onChange={e => setNewExp(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" min="0" step="50" />
              </div>
              <div>
                <label className="form-label">วันที่</label>
                <input type="date" className="form-input" value={newExp.date}
                  onChange={e => setNewExp(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">คนขับ (ไม่บังคับ)</label>
                <select className="form-input" value={newExp.driver_id}
                  onChange={e => setNewExp(f => ({ ...f, driver_id: e.target.value }))}>
                  <option value="">- ไม่ระบุ -</option>
                  {activeDrivers.map(d => (
                    <option key={d.id} value={d.id}>{d.nickname} ({d.name})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowAddExp(false)} className="btn-secondary text-sm">ยกเลิก</button>
              <button onClick={saveExpense} className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-800">Import CSV</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {selectedDriver?.name}
                </span>
              </div>
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportDone(null); }}
                className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {importDone && (
              <div className={`mx-6 mt-4 rounded-lg px-4 py-3 flex items-center gap-2 text-sm font-medium
                ${importDone.fail === 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                นำเข้าสำเร็จ {importDone.ok} รายการ
                {importDone.fail > 0 && ` · ล้มเหลว ${importDone.fail} รายการ`}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="px-6 pt-4 flex gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-green-700 bg-green-50 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  พร้อม: {importRows.filter(r => r.errors.length === 0).length}
                </span>
                {importRows.some(r => r.errors.length > 0) && (
                  <span className="flex items-center gap-1.5 text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    <AlertCircle className="w-4 h-4" />
                    มีปัญหา: {importRows.filter(r => r.errors.length > 0).length}
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 overflow-auto px-6 py-4">
              {importRows.length === 0 && !importDone ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <FileUp className="w-10 h-10 mb-2" />
                  <p>กรุณาเลือกไฟล์ CSV</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        {['สถานะ','วันที่','สินค้า','ต้นทาง','ปลายทาง','ไมล์ต้น','ไมล์ปลาย','ค่าขนส่ง','ค่าเที่ยว','น้ำมัน','หมายเหตุ'].map(h => (
                          <th key={h} className="px-2 py-2 text-left border border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => (
                        <tr key={i} className={row.errors.length > 0 ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-2 py-1.5 border border-slate-200">
                            {row.errors.length === 0
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <div className="flex items-start gap-1">
                                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                  <span className="text-red-600 leading-tight">{row.errors.join(', ')}</span>
                                </div>
                            }
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
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                รองรับเฉพาะไฟล์ที่ Export จากระบบนี้เท่านั้น (ปุ่ม &ldquo;Export&rdquo; ด้านบน) — ลำดับคอลัมน์: วันที่, คนขับ, สินค้า, น้ำหนัก, ต้นทาง, ปลายทาง, ไมล์ต้น, ไมล์ปลาย, ระยะ(กม.), ค่าน้ำมัน, ลิตร, ค่าขนส่ง, ค่าเที่ยว, เบิก, รายการอื่นๆ, ค่าอื่นๆ, หมายเหตุ
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowImport(false); setImportRows([]); setImportDone(null); }}
                  className="btn-secondary text-sm">ปิด</button>
                {importRows.filter(r => r.errors.length === 0).length > 0 && !importDone && (
                  <button onClick={handleConfirmImport} disabled={importing}
                    className="btn-primary text-sm min-w-[120px] justify-center">
                    {importing
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลัง import...</>
                      : <><FileUp className="w-4 h-4" /> Import {importRows.filter(r => r.errors.length === 0).length} รายการ</>
                    }
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
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" /> ตั้งค่าไมล์เริ่มต้น
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              คนขับ: <span className="font-medium">{selectedDriver?.name}</span>
            </p>
            <input type="number" value={tempOdo}
              onChange={e => setTempOdo(e.target.value)}
              className="form-input mb-4"
              placeholder="เลขไมล์เริ่มต้น..." />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowOdoSettings(false)} className="btn-secondary text-sm">ยกเลิก</button>
              <button onClick={handleSaveOdo} className="btn-primary text-sm">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
