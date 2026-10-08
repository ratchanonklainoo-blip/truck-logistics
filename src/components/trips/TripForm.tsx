'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Save, X, Plus, Check, ChevronDown, MapPin,
  Upload, Eye, Calculator, Fuel, Pencil, Package, AlertTriangle,
} from 'lucide-react';
import type { TripFormData, Driver } from '@/types';
import { calcCommission, calcDistance, safeNumber, compressImage } from '@/lib/utils';
import { COMMISSION_RATE } from '@/lib/constants';
import { todayBangkok } from '@/lib/dateTh';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';
import { findDuplicateTrips, odometerWarnings, payMismatch, missingRouteWarning, zeroKmFuelElsewhereWarnings, type CheckTrip } from '@/lib/tripChecks';

// ── Zod schema ──────────────────────────────────────────────
const tripSchema = z.object({
  date:            z.string().min(1, 'กรุณาระบุวันที่'),
  driver_id:       z.string().uuid('กรุณาเลือกคนขับ'),
  origin:          z.string().default(''),
  destination:     z.string().default(''),
  product:         z.string().default(''),
  weight:          z.string().default(''),
  transport_price: z.coerce.number().min(0).default(0),
  // ค่าเที่ยวห้ามว่าง (ไม่จ่ายให้ใส่ 0 หรือติ๊ก "ไม่นับค่าเที่ยว") — เดิม coerce ทำให้ช่องว่างกลายเป็น 0 เงียบๆ
  trip_pay:        z.preprocess(
    v => (v === '' || v == null ? undefined : Number(v)),
    z.number({ required_error: 'กรุณากรอกค่าเที่ยว (ไม่จ่ายให้ใส่ 0)', invalid_type_error: 'ค่าเที่ยวต้องเป็นตัวเลข' })
      .min(0, 'ค่าเที่ยวติดลบไม่ได้'),
  ),
  odometer_start:  z.coerce.number().min(0).default(0),
  odometer_end:    z.coerce.number().min(0).default(0),
  distance:        z.coerce.number().min(0).default(0),
  fuel_cost:       z.coerce.number().min(0).default(0),
  fuel_litres:     z.coerce.number().min(0).default(0),
  other_item:      z.string().default(''),
  other_cost:      z.coerce.number().min(0).default(0),
  withdraw:        z.coerce.number().min(0).default(0),
  remarks:         z.string().default(''),
  receipt_image_url: z.string().nullable().default(null),
  plate:           z.string().default(''), // ทะเบียนรถของเที่ยว — ว่าง = ใช้ทะเบียนของคนขับ
});

type TripSchema = z.infer<typeof tripSchema>;

interface TripFormProps {
  drivers:          Driver[];
  selectedDriverId: string;
  initialOdometer:  number;
  products:         string[];
  locations:        string[];
  editingTrip:      (TripFormData & { id: string }) | null;
  onSave:           (data: TripSchema, id?: string) => Promise<void>;
  onCancel:         () => void;
  onAddProduct:     (name: string) => Promise<void>;
  onAddLocation:    (name: string) => Promise<void>;
  /** เจอเที่ยวซ้ำแล้วผู้ใช้เลือก "แก้แถวเดิม" → เปิดแถวนั้นในโหมดแก้ไข */
  onEditExisting:   (tripId: string) => void;
}

type ExistingTrip = CheckTrip & {
  id: string; transport_price: number; trip_pay: number; withdraw: number;
  drivers: { nickname: string | null; license_plate: string | null } | null;
};
type PreSave = { data: TripSchema; dups: ExistingTrip[]; odo: string[] };

const DAY = 86400000;
const shiftDate = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export default function TripForm({
  drivers, selectedDriverId, initialOdometer,
  products, locations, editingTrip,
  onSave, onCancel, onAddProduct, onAddLocation, onEditExisting,
}: TripFormProps) {
  const isEditing = !!editingTrip;
  const [supabase] = useState(() => createClient());

  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors, isSubmitting } } =
    useForm<TripSchema>({
      resolver: zodResolver(tripSchema),
      defaultValues: {
        date:            todayBangkok(),
        driver_id:       selectedDriverId,
        origin:          '',
        destination:     '',
        product:         '',
        weight:          '',
        transport_price: 0,
        trip_pay:        0,
        odometer_start:  initialOdometer,
        odometer_end:    0,
        distance:        0,
        fuel_cost:       0,
        fuel_litres:     0,
        other_item:      '',
        other_cost:      0,
        withdraw:        0,
        remarks:         '',
        receipt_image_url: null,
        plate:           drivers.find(d => d.id === selectedDriverId)?.license_plate || '',
      },
    });

  // Populate form when editing
  useEffect(() => {
    if (editingTrip) {
      reset({
        date:            editingTrip.date,
        driver_id:       editingTrip.driver_id,
        origin:          editingTrip.origin === '-' ? '' : editingTrip.origin,
        destination:     editingTrip.destination === '-' ? '' : editingTrip.destination,
        product:         editingTrip.product,
        weight:          editingTrip.weight,
        transport_price: safeNumber(editingTrip.transport_price),
        trip_pay:        safeNumber(editingTrip.trip_pay),
        odometer_start:  safeNumber(editingTrip.odometer_start),
        odometer_end:    safeNumber(editingTrip.odometer_end),
        distance:        safeNumber(editingTrip.distance),
        fuel_cost:       safeNumber(editingTrip.fuel_cost),
        fuel_litres:     safeNumber(editingTrip.fuel_litres),
        other_item:      editingTrip.other_item,
        other_cost:      safeNumber(editingTrip.other_cost),
        withdraw:        safeNumber(editingTrip.withdraw),
        remarks:         editingTrip.remarks,
        receipt_image_url: editingTrip.receipt_image_url ?? null,
        plate:           editingTrip.plate ?? '', // เที่ยวเก่าไม่มีทะเบียน → เว้นว่าง (ไม่ backfill)
      });
    } else {
      reset({
        date:            todayBangkok(),
        driver_id:       selectedDriverId,
        origin:          '', destination: '', product: '', weight: '',
        transport_price: 0, trip_pay: 0,
        odometer_start:  initialOdometer, odometer_end: 0, distance: 0,
        fuel_cost: 0, fuel_litres: 0, other_item: '', other_cost: 0,
        withdraw: 0, remarks: '', receipt_image_url: null,
        plate: drivers.find(d => d.id === selectedDriverId)?.license_plate || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTrip, selectedDriverId, initialOdometer, reset]);

  // เพิ่มเที่ยวใหม่: เปลี่ยนคนขับ → ตั้งทะเบียนเป็นของคนขับคนนั้น (แก้เองได้ภายหลัง)
  const handleDriverChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isEditing) return;
    setValue('plate', drivers.find(d => d.id === e.target.value)?.license_plate || '');
  };

  // ── No commission flag ──────────────────────────────────
  const [noTripPay, setNoTripPay] = useState(false);

  // When editing: auto-detect if commission was intentionally 0
  useEffect(() => {
    if (editingTrip) {
      const wasZero = editingTrip.trip_pay === 0 && safeNumber(editingTrip.transport_price) > 0;
      setNoTripPay(wasZero);
    } else {
      setNoTripPay(false);
    }
  }, [editingTrip]);

  // คำนวณค่าเที่ยว 10% ใหม่ "เฉพาะตอนผู้ใช้พิมพ์ค่าขนส่งหรือสลับติ๊ก 'ไม่นับค่าเที่ยว'" เท่านั้น
  // (ไม่ใช้ useEffect ผูกกับค่าฟอร์ม เพราะเปิดโหมดแก้ไข/reset แล้วจะเขียนทับค่าเที่ยวเดิมที่ไม่เท่า 10% ของเที่ยวเก่า)
  const handleTransportPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (noTripPay) return; // โหมดไม่นับค่าเที่ยว คงเป็น 0
    setValue('trip_pay', calcCommission(safeNumber(e.target.value === '' ? 0 : Number(e.target.value)), COMMISSION_RATE));
  };

  const handleToggleNoTripPay = () => {
    const next = !noTripPay;
    setNoTripPay(next);
    setValue('trip_pay', next ? 0 : calcCommission(safeNumber(watch('transport_price')), COMMISSION_RATE));
  };

  // Auto-calc distance when odometer changes
  // Only overwrite distance if odometer_end > 0 (user actually entered odometer data)
  // If both are 0, keep the manually-entered distance value intact
  const odomStart = watch('odometer_start');
  const odomEnd   = watch('odometer_end');
  const odomEndNum = safeNumber(odomEnd);
  useEffect(() => {
    if (odomEndNum > 0) {
      setValue('distance', calcDistance(safeNumber(odomStart), odomEndNum));
    }
  }, [odomStart, odomEndNum, setValue]);

  // ── Dropdown state ──────────────────────────────────────
  const [showProduct, setShowProduct] = useState(false);
  const [showOrigin,  setShowOrigin]  = useState(false);
  const [showDest,    setShowDest]    = useState(false);
  const [previewImg,  setPreviewImg]  = useState<string | null>(null);

  const productRef = useRef<HTMLDivElement>(null);
  const originRef  = useRef<HTMLDivElement>(null);
  const destRef    = useRef<HTMLDivElement>(null);

  const watchedProduct = watch('product');
  const watchedOrigin  = watch('origin');
  const watchedDest    = watch('destination');
  const watchedImg     = watch('receipt_image_url');

  const filteredProducts  = products.filter(p => p.toLowerCase().includes((watchedProduct || '').toLowerCase()));
  const filteredOrigins   = locations.filter(l => l.toLowerCase().includes((watchedOrigin  || '').toLowerCase()));
  const filteredDests     = locations.filter(l => l.toLowerCase().includes((watchedDest     || '').toLowerCase()));

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(e.target as Node)) setShowProduct(false);
      if (originRef.current  && !originRef.current.contains(e.target as Node))  setShowOrigin(false);
      if (destRef.current    && !destRef.current.contains(e.target as Node))    setShowDest(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Image upload
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกินไป (ไม่เกิน 5MB)'); return; }
    const compressed = await compressImage(file);
    setValue('receipt_image_url', compressed);
  }, [setValue]);

  // ── จ่ายค่าเที่ยวสดแล้ว: เติมเบิก = ค่าเที่ยว อัตโนมัติ (แก้ได้) แทนการพิมพ์ในหมายเหตุ ──
  const [paidCash, setPaidCash] = useState(false);
  const watchedTripPay = watch('trip_pay');
  useEffect(() => {
    setPaidCash(!!editingTrip && safeNumber(editingTrip.trip_pay) > 0
      && safeNumber(editingTrip.withdraw) === safeNumber(editingTrip.trip_pay));
  }, [editingTrip]);
  useEffect(() => {
    if (paidCash) setValue('withdraw', safeNumber(watchedTripPay as number | ''));
  }, [paidCash, watchedTripPay, setValue]);

  // ── ตรวจก่อนบันทึก ─────────────────────────────────────────
  const [mismatchOk, setMismatchOk] = useState(false);
  const [mismatchError, setMismatchError] = useState('');
  const [preSave, setPreSave] = useState<PreSave | null>(null);
  const [checkError, setCheckError] = useState('');
  useEffect(() => { setMismatchOk(false); setMismatchError(''); setPreSave(null); setCheckError(''); }, [editingTrip]);

  const finalize = (data: TripSchema) => ({
    ...data,
    origin:      data.origin.trim()      || '-',
    destination: data.destination.trim() || '-',
    plate:       data.plate.trim(), // ว่าง → หน้าเที่ยวบันทึกเป็น null
  });

  const onSubmit = async (data: TripSchema) => {
    const fd = finalize(data);
    const driverPlate = drivers.find(d => d.id === fd.driver_id)?.license_plate || '';
    const me: CheckTrip = { ...fd, id: editingTrip?.id, driver_plate: driverPlate };

    // 1) ค่าขนส่ง 0 แต่ค่าเที่ยว > 0 (หรือกลับกัน) ต้องติ๊กยืนยัน — กรณีค่าเที่ยว 0 การติ๊ก "ไม่นับค่าเที่ยว" ถือเป็นการยืนยัน
    const mm = payMismatch(me);
    if (mm && !mismatchOk && !(mm === 'no_pay' && noTripPay)) {
      setMismatchError(mm === 'no_price'
        ? 'ค่าขนส่งเป็น 0 แต่มีค่าเที่ยว — ถ้าถูกต้อง (เช่น ลูกค้าจ่ายแยก) ให้ติ๊กยืนยันด้านล่างก่อนบันทึก'
        : 'มีค่าขนส่งแต่ค่าเที่ยวเป็น 0 — ติ๊ก "ไม่นับค่าเที่ยว" หรือติ๊กยืนยันด้านล่างก่อนบันทึก');
      return;
    }
    setMismatchError('');

    // 2) เที่ยวซ้ำ (±1 วัน รถ/ทะเบียนเดียวกัน เส้นทางเดียวกัน) + เลขไมล์ซ้ำ/ถอยหลัง — ค้นย้อนหลัง 60 วันถึง +1 วัน
    setCheckError('');
    const { data: rows, error } = await fetchAllRows<ExistingTrip>((a, b) => supabase.from('trips')
      .select('id,date,driver_id,origin,destination,plate,odometer_start,odometer_end,fuel_cost,fuel_litres,transport_price,trip_pay,withdraw,created_at,'
        + 'drivers!trips_driver_id_fkey(nickname,license_plate)')
      .is('deleted_at', null)
      .gte('date', shiftDate(fd.date, -60)).lte('date', shiftDate(fd.date, 1))
      .order('id').range(a, b) as never);
    if (error) {
      setCheckError(`ตรวจเที่ยวซ้ำไม่สำเร็จ (${error.message}) — ตรวจสัญญาณแล้วกดบันทึกอีกครั้ง`);
      return;
    }
    const others = rows.map(r => ({ ...r, driver_plate: r.drivers?.license_plate || '' }));
    const dups = findDuplicateTrips(me, others);
    const odo = [...odometerWarnings(me, others), ...zeroKmFuelElsewhereWarnings(me, others)];
    if (dups.length > 0 || odo.length > 0) {
      setPreSave({ data: fd, dups, odo });
      return;
    }
    await onSave(fd, editingTrip?.id);
  };

  const [savingPre, setSavingPre] = useState(false);
  const confirmPreSave = async () => {
    if (!preSave) return;
    const d = preSave.data;
    setPreSave(null);
    setSavingPre(true);
    try { await onSave(d, editingTrip?.id); } finally { setSavingPre(false); }
  };
  // W1: เตือนขณะกรอก (ไม่บล็อก) — แถวมีน้ำมัน/ไมล์ แต่ไม่มีต้นทาง-ปลายทาง
  const routeWarnNow = missingRouteWarning({
    date: '', driver_id: '', origin: watch('origin'), destination: watch('destination'),
    odometer_start: odomStart, odometer_end: odomEnd, fuel_cost: watch('fuel_cost'), fuel_litres: watch('fuel_litres'),
  });
  const mismatchNow = payMismatch({
    date: '', driver_id: '', origin: watch('origin'), destination: watch('destination'),
    transport_price: watch('transport_price'), trip_pay: watchedTripPay as number,
  });

  return (
    <div className={`rounded-xl border-2 p-5 ${isEditing ? 'bg-yellow-50 border-yellow-300' : 'bg-blue-50 border-blue-100'}`}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={`font-semibold flex items-center gap-2 ${isEditing ? 'text-yellow-800' : 'text-blue-800'}`}>
          {isEditing ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {isEditing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}
        </h3>
        {isEditing && (
          <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
            <X className="w-4 h-4" /> ยกเลิก
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* วันที่ */}
        <div>
          <label className="form-label">วันที่</label>
          <input type="date" {...register('date')} className="form-input" />
          {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
        </div>

        {/* คนขับ */}
        <div>
          <label className="form-label">คนขับ</label>
          <select {...register('driver_id', { onChange: handleDriverChange })} className="form-input">
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.nickname} — {d.name}{d.is_active === false ? ' (ปิดใช้งาน)' : ''}</option>
            ))}
          </select>
        </div>

        {/* ทะเบียนรถของเที่ยว */}
        <div>
          <label className="form-label">ทะเบียนรถ</label>
          <input {...register('plate')} className="form-input" autoComplete="off"
            placeholder={`ว่าง = ใช้ทะเบียนของคนขับ (${drivers.find(d => d.id === watch('driver_id'))?.license_plate || '-'})`} />
          <p className="text-xs text-slate-400 mt-1">ตั้งจากทะเบียนของคนขับ แก้ได้ถ้าวันนี้ขับคันอื่น</p>
        </div>

        {/* คำนวณระยะทาง */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-500" /> คำนวณระยะทาง
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="form-label text-xs">ไมล์ต้น</label>
              <input type="number" {...register('odometer_start')} className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="form-label text-xs">ไมล์ปลาย</label>
              <input type="number" {...register('odometer_end')} className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="form-label text-xs">
                ระยะทาง (กม.)
                {odomEndNum > 0
                  ? <span className="text-blue-500 text-xs ml-1">auto</span>
                  : <span className="text-slate-400 text-xs ml-1">กรอกเอง</span>}
              </label>
              <input
                type="number"
                {...register('distance')}
                readOnly={odomEndNum > 0}
                className={`form-input ${odomEndNum > 0 ? 'bg-slate-50 text-slate-500' : ''}`}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* น้ำมัน */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label flex items-center gap-1">
              <Fuel className="w-3 h-3 text-blue-500" /> ค่าน้ำมัน (บาท)
            </label>
            <input type="number" step="0.01" {...register('fuel_cost')} className="form-input" placeholder="0" />
          </div>
          <div>
            <label className="form-label">น้ำมัน (ลิตร)</label>
            <input type="number" step="0.001" {...register('fuel_litres')} className="form-input" placeholder="0" />
          </div>
        </div>

        {/* รูปใบเสร็จ */}
        <div>
          <label className="form-label flex items-center gap-1">
            <Upload className="w-3 h-3 text-blue-500" /> รูปสลิป/ใบเสร็จ
          </label>
          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer bg-white border border-slate-300 rounded-lg px-3 py-2 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors text-sm text-slate-600">
              <Upload className="w-4 h-4" /> เลือกรูป
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            {watchedImg && (
              <button type="button" onClick={() => setPreviewImg(watchedImg)}
                      className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors">
                <Eye className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* สินค้า */}
        <div ref={productRef}>
          <label className="form-label flex items-center gap-1">
            <Package className="w-3 h-3 text-blue-500" /> สินค้า
          </label>
          <div className="relative">
            <input
              {...register('product')}
              onFocus={() => setShowProduct(true)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="form-input pr-8"
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            {showProduct && (
              <div className="dropdown-menu animate-fade-in-up">
                {filteredProducts.map(p => (
                  <div key={p} className="dropdown-item flex justify-between items-center"
                       onClick={() => { setValue('product', p); setShowProduct(false); }}>
                    {p} {watchedProduct === p && <Check className="w-3 h-3 text-blue-500" />}
                  </div>
                ))}
                {watchedProduct && !products.some(p => p.toLowerCase() === watchedProduct.toLowerCase()) && (
                  <div className="dropdown-item bg-slate-50 text-green-700 font-medium border-t border-slate-200 flex items-center gap-2"
                       onClick={() => { onAddProduct(watchedProduct); setShowProduct(false); }}>
                    <Plus className="w-3 h-3" /> เพิ่ม &ldquo;{watchedProduct}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* น้ำหนัก + ค่าขนส่ง */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">น้ำหนัก</label>
            <input {...register('weight')} className="form-input" placeholder="เช่น 30,000 กก." />
          </div>
          <div>
            <label className="form-label">ค่าขนส่ง (บาท)</label>
            <input type="number" {...register('transport_price', { onChange: handleTransportPriceChange })} className="form-input" placeholder="0" />
          </div>
        </div>

        {/* ต้นทาง / ปลายทาง */}
        <div className="grid grid-cols-2 gap-3">
          <div ref={originRef}>
            <label className="form-label flex items-center gap-1">
              <MapPin className="w-3 h-3 text-green-500" /> ต้นทาง
            </label>
            <div className="relative">
              <input
                {...register('origin')}
                onFocus={() => setShowOrigin(true)}
                placeholder="ระบุต้นทาง..."
                className="form-input"
                autoComplete="off"
              />
              {showOrigin && (
                <div className="dropdown-menu animate-fade-in-up">
                  {filteredOrigins.map(l => (
                    <div key={l} className="dropdown-item"
                         onClick={() => { setValue('origin', l); setShowOrigin(false); }}>
                      {l}
                    </div>
                  ))}
                  {watchedOrigin && !locations.some(l => l.toLowerCase() === watchedOrigin.toLowerCase()) && (
                    <div className="dropdown-item bg-slate-50 text-green-700 font-medium border-t flex items-center gap-2"
                         onClick={() => { onAddLocation(watchedOrigin); setValue('origin', watchedOrigin); setShowOrigin(false); }}>
                      <Plus className="w-3 h-3" /> เพิ่ม &ldquo;{watchedOrigin}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div ref={destRef}>
            <label className="form-label flex items-center gap-1">
              <MapPin className="w-3 h-3 text-red-500" /> ปลายทาง
            </label>
            <div className="relative">
              <input
                {...register('destination')}
                onFocus={() => setShowDest(true)}
                placeholder="ระบุปลายทาง..."
                className="form-input"
                autoComplete="off"
              />
              {showDest && (
                <div className="dropdown-menu animate-fade-in-up">
                  {filteredDests.map(l => (
                    <div key={l} className="dropdown-item"
                         onClick={() => { setValue('destination', l); setShowDest(false); }}>
                      {l}
                    </div>
                  ))}
                  {watchedDest && !locations.some(l => l.toLowerCase() === watchedDest.toLowerCase()) && (
                    <div className="dropdown-item bg-slate-50 text-green-700 font-medium border-t flex items-center gap-2"
                         onClick={() => { onAddLocation(watchedDest); setValue('destination', watchedDest); setShowDest(false); }}>
                      <Plus className="w-3 h-3" /> เพิ่ม &ldquo;{watchedDest}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {routeWarnNow && (
          <p role="status" className="-mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />{routeWarnNow}
          </p>
        )}

        {/* รายการอื่นๆ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">รายการอื่นๆ</label>
            <input {...register('other_item')} className="form-input" placeholder="เช่น ค่าซ่อม, ปะยาง" />
          </div>
          <div>
            <label className="form-label">ค่าอื่นๆ (บาท)</label>
            <input type="number" {...register('other_cost')} className="form-input" placeholder="0" />
          </div>
        </div>

        {/* ค่าเที่ยว + เบิก */}
        <div className="space-y-2">
          {/* No-commission toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
            <div
              onClick={handleToggleNoTripPay}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                noTripPay
                  ? 'bg-red-500 border-red-500'
                  : 'bg-white border-slate-300 hover:border-slate-400'
              }`}
            >
              {noTripPay && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm font-medium text-slate-700">
              ไม่นับค่าเที่ยว
              <span className="ml-1.5 text-xs font-normal text-slate-400">(ไม่คิดค่ารอบในสลิปเงินเดือน)</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">
                ค่าเที่ยว (บาท)
                {!noTripPay && <span className="text-blue-500 text-xs ml-1">auto 10%</span>}
                {noTripPay  && <span className="text-red-500 text-xs ml-1">ไม่นับ</span>}
              </label>
              <input
                type="number" step="0.01"
                {...register('trip_pay')}
                readOnly={noTripPay}
                className={`form-input ${noTripPay ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
              />
              {errors.trip_pay && <p className="text-red-500 text-xs mt-1">{errors.trip_pay.message}</p>}
            </div>
            <div>
              <label className="form-label">
                เบิก/หัก (บาท)
                {paidCash && <span className="text-green-600 text-xs ml-1">= ค่าเที่ยว (จ่ายสด)</span>}
              </label>
              <input type="number" {...register('withdraw')} className="form-input" placeholder="0" />
        
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {/* จ่ายค่าเที่ยวสดแล้ว → เบิก = ค่าเที่ยว (หักออกจากใบเงินเดือน ไม่จ่ายซ้ำ) */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
            <input type="checkbox" className="w-4 h-4" checked={paidCash}
              onChange={e => setPaidCash(e.target.checked)} />
            <span className="text-sm font-medium text-slate-700">
              จ่ายค่าเที่ยวสดแล้ว
              <span className="ml-1.5 text-xs font-normal text-slate-400">(เติมช่องเบิกเท่าค่าเที่ยวให้อัตโนมัติ แก้ได้)</span>
            </span>
          </label>

          {/* ค่าขนส่งกับค่าเที่ยวไม่สอดคล้อง → ต้องติ๊กยืนยัน */}
          {mismatchNow && !(mismatchNow === 'no_pay' && noTripPay) && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none bg-amber-50 border border-amber-200 rounded-lg p-2">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={mismatchOk}
                onChange={e => { setMismatchOk(e.target.checked); if (e.target.checked) setMismatchError(''); }} />
              <span className="text-sm text-amber-800">
                {mismatchNow === 'no_price'
                  ? 'ยืนยัน: ค่าขนส่ง 0 แต่จ่ายค่าเที่ยว (ถูกต้อง ไม่ใช่เที่ยวที่บันทึกแยกสองแถว)'
                  : 'ยืนยัน: มีค่าขนส่งแต่ค่าเที่ยว 0 (ถูกต้อง ไม่ใช่เที่ยวที่บันทึกแยกสองแถว)'}
              </span>
            </label>
          )}
          {mismatchError && <p className="text-red-600 text-xs">{mismatchError}</p>}
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="form-label">หมายเหตุ</label>
          <input {...register('remarks')} className="form-input" placeholder="รายละเอียดเพิ่มเติม" />
        </div>

        {/* Submit */}
        {checkError && <p className="text-red-600 text-sm">{checkError}</p>}
        <button
          type="submit"
          disabled={isSubmitting || savingPre}
          className={`w-full font-semibold py-2.5 px-4 rounded-lg shadow transition-colors flex justify-center items-center gap-2
            ${isEditing
              ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'}
            disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isSubmitting || savingPre ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</>
          ) : (
            <><Save className="w-4 h-4" /> {isEditing ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</>
          )}
        </button>
      </form>

      {/* กล่องเตือนก่อนบันทึก: เที่ยวซ้ำ / เลขไมล์ */}
      {preSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4"
               role="alertdialog" aria-modal="true">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {preSave.dups.length > 0 ? 'มีเที่ยวนี้แล้ว — ตรวจก่อนบันทึก' : 'ตรวจเลขไมล์ก่อนบันทึก'}
            </h3>
            {preSave.dups.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  พบเที่ยววันใกล้กัน (±1 วัน) รถ/ทะเบียนเดียวกัน เส้นทางเดียวกัน — ถ้าเป็นเที่ยวเดียวกัน ให้แก้แถวเดิม
                  (เช่น เติมค่าเที่ยว/ค่าขนส่งในแถวเดิม) แทนการเพิ่มแถวใหม่
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left px-2 py-1.5">วันที่</th><th className="text-left px-2 py-1.5">คนขับ</th>
                        <th className="text-left px-2 py-1.5">เส้นทาง</th><th className="text-right px-2 py-1.5">ค่าขนส่ง</th>
                        <th className="text-right px-2 py-1.5">ค่าเที่ยว</th><th className="text-right px-2 py-1.5">ไมล์</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preSave.dups.map((t, i) => (
                        <tr key={t.id}>
                          <td className="px-2 py-1.5">{t.date}</td>
                          <td className="px-2 py-1.5">{t.drivers?.nickname || '-'}</td>
                          <td className="px-2 py-1.5">{t.origin} → {t.destination}</td>
                          <td className="px-2 py-1.5 text-right">{Number(t.transport_price).toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right">{Number(t.trip_pay).toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right">{Number(t.odometer_start) || '-'}–{Number(t.odometer_end) || '-'}</td>
                          <td className="px-2 py-1.5">
                            <button type="button" autoFocus={i === 0}
                              onClick={() => { setPreSave(null); onEditExisting(t.id); }}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-2 py-1 whitespace-nowrap">
                              แก้แถวเดิม
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400">กด &quot;แก้แถวเดิม&quot; แล้วข้อมูลที่กรอกอยู่จะถูกแทนด้วยแถวเดิมให้แก้</p>
              </div>
            )}
            {preSave.odo.length > 0 && (
              <ul className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 list-disc pl-6 space-y-1">
                {preSave.odo.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setPreSave(null)} className="btn-secondary text-sm"
                autoFocus={preSave.dups.length === 0}>
                กลับไปแก้
              </button>
              <button type="button" onClick={confirmPreSave}
                className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                {preSave.dups.length > 0 ? 'บันทึกเป็นเที่ยวใหม่' : 'บันทึกต่อ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
             onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-3xl max-h-full p-4" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Receipt" className="max-h-[90vh] rounded-lg shadow-2xl" />
            <button className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-1 hover:bg-black/80"
                    onClick={() => setPreviewImg(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
