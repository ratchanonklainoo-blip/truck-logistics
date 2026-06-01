'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Save, X, Plus, Check, ChevronDown, MapPin,
  Upload, Eye, Calculator, Fuel, Pencil, Package,
} from 'lucide-react';
import type { TripFormData, Driver } from '@/types';
import { calcCommission, calcDistance, safeNumber, compressImage } from '@/lib/utils';
import { COMMISSION_RATE } from '@/lib/constants';

// ── Zod schema ──────────────────────────────────────────────
const tripSchema = z.object({
  date:            z.string().min(1, 'กรุณาระบุวันที่'),
  driver_id:       z.string().uuid('กรุณาเลือกคนขับ'),
  origin:          z.string().min(1, 'กรุณาระบุต้นทาง'),
  destination:     z.string().min(1, 'กรุณาระบุปลายทาง'),
  product:         z.string().default(''),
  weight:          z.string().default(''),
  transport_price: z.coerce.number().min(0).default(0),
  trip_pay:        z.coerce.number().min(0).default(0),
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
}

export default function TripForm({
  drivers, selectedDriverId, initialOdometer,
  products, locations, editingTrip,
  onSave, onCancel, onAddProduct, onAddLocation,
}: TripFormProps) {
  const isEditing = !!editingTrip;

  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors, isSubmitting } } =
    useForm<TripSchema>({
      resolver: zodResolver(tripSchema),
      defaultValues: {
        date:            new Date().toISOString().split('T')[0],
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
      },
    });

  // Populate form when editing
  useEffect(() => {
    if (editingTrip) {
      reset({
        date:            editingTrip.date,
        driver_id:       editingTrip.driver_id,
        origin:          editingTrip.origin,
        destination:     editingTrip.destination,
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
      });
    } else {
      reset({
        date:            new Date().toISOString().split('T')[0],
        driver_id:       selectedDriverId,
        origin:          '', destination: '', product: '', weight: '',
        transport_price: 0, trip_pay: 0,
        odometer_start:  initialOdometer, odometer_end: 0, distance: 0,
        fuel_cost: 0, fuel_litres: 0, other_item: '', other_cost: 0,
        withdraw: 0, remarks: '', receipt_image_url: null,
      });
    }
  }, [editingTrip, selectedDriverId, initialOdometer, reset]);

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

  // Auto-calc trip_pay when transport_price changes (skip if no-commission mode)
  const transportPrice = watch('transport_price');
  useEffect(() => {
    if (noTripPay) {
      setValue('trip_pay', 0);
    } else {
      const pay = calcCommission(safeNumber(transportPrice), COMMISSION_RATE);
      setValue('trip_pay', pay);
    }
  }, [transportPrice, noTripPay, setValue]);

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

  const onSubmit = async (data: TripSchema) => {
    await onSave(data, editingTrip?.id);
  };

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
          <select {...register('driver_id')} className="form-input">
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.nickname} — {d.name}</option>
            ))}
          </select>
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
            <input type="number" {...register('transport_price')} className="form-input" placeholder="0" />
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
            {errors.origin && <p className="text-red-500 text-xs mt-1">{errors.origin.message}</p>}
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
            {errors.destination && <p className="text-red-500 text-xs mt-1">{errors.destination.message}</p>}
          </div>
        </div>

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
              onClick={() => setNoTripPay(v => !v)}
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
                disabled={noTripPay}
                className={`form-input ${noTripPay ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label className="form-label">เบิก/หัก (บาท)</label>
              <input type="number" {...register('withdraw')} className="form-input" placeholder="0" />
        
            </div>
          </div>
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="form-label">หมายเหตุ</label>
          <input {...register('remarks')} className="form-input" placeholder="รายละเอียดเพิ่มเติม" />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full font-semibold py-2.5 px-4 rounded-lg shadow transition-colors flex justify-center items-center gap-2
            ${isEditing
              ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'}
            disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isSubmitting ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</>
          ) : (
            <><Save className="w-4 h-4" /> {isEditing ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</>
          )}
        </button>
      </form>

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
