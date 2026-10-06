'use client';

// กำไรรายเที่ยว — หน้าสรุปอ่านอย่างเดียว (สูตรที่ lib/tripProfit.ts ผ่าน /api/reports/trip-profit)
// ไม่มีการแก้ข้อมูลในหน้านี้ ; แก้เที่ยวที่หน้าเที่ยววิ่งเดิม
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw, Image as ImageIcon, X, ExternalLink } from 'lucide-react';
import { formatCurrency, formatNumber, formatThaiDate, adToBE } from '@/lib/utils';
import { THAI_MONTHS } from '@/lib/constants';
import { todayBangkok } from '@/lib/dateTh';
import { summarizeTrips, type TripProfitResult, type TPTrip, type ProfitColor } from '@/lib/tripProfit';

function displayMonthYear(my: string): string {
  const [y, m] = my.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${adToBE(y)}`;
}
const baht = (n: number) => formatNumber(n, 2);
const COLOR_TEXT: Record<ProfitColor, string> = { green: 'text-emerald-700', yellow: 'text-amber-600', red: 'text-red-600' };
const COLOR_ROW: Record<ProfitColor, string> = { green: '', yellow: 'bg-amber-50/60', red: 'bg-red-50/60' };
const profitColorOf = (profit: number, revenue: number): ProfitColor =>
  profit < 0 || revenue <= 0 ? 'red' : profit < revenue * 0.1 ? 'yellow' : 'green';

function Card({ label, value, sub, tone = 'text-slate-800' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function kmLabel(t: TPTrip): string {
  if (t.km) return t.group_size > 1 ? `${formatNumber(t.km)} (ไมล์รวม ${t.group_size} เที่ยว)` : formatNumber(t.km);
  return t.group_host ? `ไม่ทราบ (รวมรอบ ${t.group_host})` : 'ไม่ทราบระยะทาง';
}

export default function TripProfitPage() {
  const [monthYear, setMonthYear] = useState(() => todayBangkok().slice(0, 7));
  const [marginPct, setMarginPct] = useState('10');
  const [data, setData] = useState<TripProfitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [fDate, setFDate] = useState('');
  const [fVehicle, setFVehicle] = useState('');
  const [fDriver, setFDriver] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fRoute, setFRoute] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const margin = Number(marginPct);
  const marginOk = marginPct.trim() !== '' && Number.isFinite(margin) && margin >= 0 && margin <= 1000;

  useEffect(() => {
    if (!marginOk) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`/api/reports/trip-profit?month_year=${monthYear}&margin=${margin}`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(j.error || `โหลดไม่สำเร็จ (${res.status})`); setData(null); }
        else setData(j.data);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [monthYear, margin, marginOk, reloadKey]);

  useEffect(() => { setFDate(''); }, [monthYear]);
  // ลิงก์ตรงเดือน: /reports/trip-profit?month=YYYY-MM
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('month');
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonthYear(m);
  }, []);

  const shiftMonth = (delta: number) => {
    const [y, m] = monthYear.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const options = useMemo(() => {
    const t = data?.trips || [];
    const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort();
    return {
      dates: uniq(t.map(x => x.date)),
      vehicles: Array.from(new Map(t.map(x => [x.vehicle, x.plate_label])).entries()),
      drivers: uniq(t.map(x => x.driver_name)),
      products: uniq(t.map(x => x.product)),
    };
  }, [data]);

  const filtersOn = !!(fDate || fVehicle || fDriver || fProduct || fRoute.trim());
  const trips = useMemo(() => {
    const q = fRoute.trim().toLowerCase();
    return (data?.trips || []).filter(t =>
      (!fDate || t.date === fDate) && (!fVehicle || t.vehicle === fVehicle) && (!fDriver || t.driver_name === fDriver)
      && (!fProduct || t.product === fProduct)
      && (!q || `${t.origin} ${t.destination}`.toLowerCase().includes(q)));
  }, [data, fDate, fVehicle, fDriver, fProduct, fRoute]);
  const others = useMemo(() => (data?.other_expenses || []).filter(o =>
    (!fDate || o.date === fDate) && (!fVehicle || o.vehicle === fVehicle) && (!fDriver || o.driver_name === fDriver)
    && !fProduct && !fRoute.trim()), [data, fDate, fVehicle, fDriver, fProduct, fRoute]);
  const totals = useMemo(() => summarizeTrips(trips, others), [trips, others]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── หัว ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">กำไรรายเที่ยว</h1>
          <p className="text-sm text-slate-500 mt-0.5">ต้นทุนเที่ยว = ค่าน้ำมันที่จัดสรรตามระยะทาง + ค่าเที่ยว · อ่านอย่างเดียว</p>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />รีโหลด
        </button>
      </div>

      {/* ── เดือน + ตัวกรอง ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="เดือนก่อน"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 min-w-[160px] text-center">{displayMonthYear(monthYear)}</div>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="เดือนถัดไป"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
            กำไรขั้นต่ำ
            <input type="number" min={0} step={1} value={marginPct} onChange={e => setMarginPct(e.target.value)}
              className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-right bg-white ${marginOk ? 'border-slate-300' : 'border-red-400'}`} />
            %
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <select value={fDate} onChange={e => setFDate(e.target.value)} className="form-input">
            <option value="">ทุกวัน</option>
            {options.dates.map(d => <option key={d} value={d}>{formatThaiDate(d, true)}</option>)}
          </select>
          <select value={fVehicle} onChange={e => setFVehicle(e.target.value)} className="form-input">
            <option value="">ทุกคัน</option>
            {options.vehicles.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={fDriver} onChange={e => setFDriver(e.target.value)} className="form-input">
            <option value="">ทุกคนขับ</option>
            {options.drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={fProduct} onChange={e => setFProduct(e.target.value)} className="form-input">
            <option value="">ทุกสินค้า</option>
            {options.products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={fRoute} onChange={e => setFRoute(e.target.value)} placeholder="ค้นหาเส้นทาง เช่น พิจิตร" className="form-input" />
        </div>
      </div>

      {loading && <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700">{error}</div>}

      {!loading && data && (
        <>
          {/* ── การ์ดสรุป ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <Card label="จำนวนเที่ยว" value={formatNumber(totals.trip_count)}
              sub={totals.no_data_trips ? `ไม่มีข้อมูลน้ำมัน/ระยะทาง ${totals.no_data_trips} เที่ยว` : undefined} />
            <Card label="ระยะทางรวม" value={`${formatNumber(totals.km)} กม.`}
              sub={totals.unknown_km_trips ? `ไม่ทราบระยะ ${totals.unknown_km_trips} เที่ยว` : undefined} />
            <Card label="ค่าน้ำมันจัดสรร" value={formatCurrency(totals.fuel_actual + totals.fuel_estimated)} tone="text-orange-700"
              sub={`${formatNumber(totals.litres, 0)} ลิตร${totals.fuel_estimated ? ` · ประมาณการ ${baht(totals.fuel_estimated)}` : ''}`} />
            <Card label="ค่าเที่ยวรวม" value={formatCurrency(totals.pay)} tone="text-blue-700" />
            <Card label="ต้นทุนเที่ยวรวม" value={formatCurrency(totals.cost)} />
            <Card label="รายได้รวม" value={formatCurrency(totals.revenue)} tone="text-green-700" />
            <Card label="กำไรจากเที่ยว" value={formatCurrency(totals.profit)} tone={COLOR_TEXT[profitColorOf(totals.profit, totals.revenue)]}
              sub={totals.revenue > 0 ? `${formatNumber((totals.profit / totals.revenue) * 100, 1)}% ของรายได้` : undefined} />
            <Card label="ต้นทุนเฉลี่ย/กม." value={totals.cost_per_km == null ? '-' : `${baht(totals.cost_per_km)} บ.`} sub="เฉพาะเที่ยวที่ทราบระยะ น้ำมันจริง" />
            <Card label="กำไรเฉลี่ย/กม." value={totals.profit_per_km == null ? '-' : `${baht(totals.profit_per_km)} บ.`}
              tone={totals.profit_per_km != null && totals.profit_per_km < 0 ? 'text-red-600' : 'text-emerald-700'} />
            <Card label="ค่าใช้จ่ายอื่นของเดือน" value={formatCurrency(totals.other_expenses)} tone="text-slate-700"
              sub={fProduct || fRoute.trim() ? 'ไม่แสดงเมื่อกรองสินค้า/เส้นทาง' : `${others.length} รายการ`} />
            <Card label="กำไรหลังหักค่าใช้จ่ายอื่น" value={formatCurrency(totals.profit_after_other)}
              tone={totals.profit_after_other < 0 ? 'text-red-600' : 'text-emerald-700'} sub="ยังไม่หักเงินเดือนฐาน/ค่าใช้จ่ายประจำ" />
          </div>

          {/* ── ตารางรายเที่ยว ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 text-sm">รายเที่ยว ({trips.length})</span>
              <span className="text-xs text-slate-500">
                <span className="text-emerald-700">● กำไร</span> · <span className="text-amber-600">● กำไรต่ำกว่า 10%</span> · <span className="text-red-600">● ขาดทุน</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1E3A5F] text-white text-xs">
                    {['วันที่', 'รอบที่', 'สินค้า / เส้นทาง', 'ระยะทาง (กม.)', 'ค่าน้ำมันจัดสรร', 'ค่าเที่ยว', 'ต้นทุนรวม', 'ต้นทุน/กม.', 'รายได้', 'กำไร/ขาดทุน', 'กำไร/กม.', `ขั้นต่ำควรรับ (${marginOk ? margin : '-'}%)`, 'รูป', 'จัดการ']
                      .map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i < 3 ? 'text-left' : i >= 12 ? 'text-center' : 'text-right'}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.length === 0 && (
                    <tr><td colSpan={14} className="text-center py-10 text-slate-400">ไม่มีเที่ยวในเดือน/ตัวกรองนี้</td></tr>
                  )}
                  {trips.map(t => (
                    <tr key={t.id} className={COLOR_ROW[t.color]}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div>{formatThaiDate(t.date, true)}</div>
                        <div className="text-[11px] text-slate-400">{t.driver_name} · {t.plate_label}</div>
                      </td>
                      <td className="px-3 py-2 text-center">{t.round}</td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="font-medium text-slate-700">{t.product || '-'}</div>
                        <div className="text-xs text-slate-500">{t.origin || '-'} → {t.destination || '-'}</div>
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${t.km ? '' : 'text-slate-400 text-xs'}`}>{kmLabel(t)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {t.fuel_mode === 'no_data'
                          ? <span className="text-xs text-slate-400">ไม่มีข้อมูลน้ำมัน/ระยะทาง</span>
                          : <>{baht(t.fuel)}{t.fuel_mode === 'estimate' && <div className="text-[10px] font-semibold text-amber-600">ประมาณการ</div>}</>}
                      </td>
                      <td className="px-3 py-2 text-right">{baht(t.pay)}</td>
                      <td className="px-3 py-2 text-right">{baht(t.cost)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{t.cost_per_km == null ? '-' : baht(t.cost_per_km)}{t.group_size > 1 && <div className="text-[10px] text-slate-400">ทั้งกลุ่ม</div>}</td>
                      <td className="px-3 py-2 text-right">{baht(t.revenue)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${COLOR_TEXT[t.color]}`}>{baht(t.profit)}</td>
                      <td className="px-3 py-2 text-right">{t.profit_per_km == null ? '-' : baht(t.profit_per_km)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {t.min_price == null ? '-' : baht(t.min_price)}
                        {t.min_price != null && t.revenue < t.min_price && <div className="text-[10px] text-red-600">รับต่ำกว่าขั้นต่ำ</div>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {t.receipt_image_url
                          ? <button onClick={() => setPreview(t.receipt_image_url)} className="text-blue-600 hover:text-blue-800" aria-label="ดูรูป"><ImageIcon className="w-4 h-4 inline" /></button>
                          : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link href="/trips" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap" title="แก้เที่ยวที่หน้าเที่ยววิ่ง">
                          แก้ที่เที่ยววิ่ง <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {trips.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-700">
                      <td className="px-3 py-2" colSpan={3}>รวม {totals.trip_count} เที่ยว</td>
                      <td className="px-3 py-2 text-right">{formatNumber(totals.km)}</td>
                      <td className="px-3 py-2 text-right">{baht(totals.fuel_actual + totals.fuel_estimated)}</td>
                      <td className="px-3 py-2 text-right">{baht(totals.pay)}</td>
                      <td className="px-3 py-2 text-right">{baht(totals.cost)}</td>
                      <td className="px-3 py-2 text-right">{totals.cost_per_km == null ? '-' : baht(totals.cost_per_km)}</td>
                      <td className="px-3 py-2 text-right">{baht(totals.revenue)}</td>
                      <td className={`px-3 py-2 text-right ${COLOR_TEXT[profitColorOf(totals.profit, totals.revenue)]}`}>{baht(totals.profit)}</td>
                      <td className="px-3 py-2 text-right">{totals.profit_per_km == null ? '-' : baht(totals.profit_per_km)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100 space-y-0.5">
              <div>ค่าน้ำมันของรถแต่ละวัน = ผลรวมค่าน้ำมันที่บันทึกในวันนั้น (+ ยอดยกมาจากวันที่ไม่มีเที่ยว) กระจายตามระยะทาง · เที่ยวไมล์ 0 ในรอบน้ำมันเดียวกันแบ่งเท่ากัน</div>
              <div>วันที่ไม่ได้เติมน้ำมัน ใช้ต้นทุนน้ำมัน/กม. เฉลี่ย 30 วันก่อนหน้าของรถคันนั้น (ประมาณการ) · ต้นทุน/กม. และกำไร/กม. ไม่นับเที่ยวที่ไม่ทราบระยะ</div>
            </div>
          </div>
          {filtersOn && <div className="text-xs text-slate-500">ตัวเลขด้านบนเป็นผลรวมตามตัวกรอง — การจัดสรรน้ำมันคำนวณจากทั้งเดือนก่อนกรอง</div>}
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="relative max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreview(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow" aria-label="ปิด"><X className="w-4 h-4" /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="รูปใบเสร็จ" className="max-h-[85vh] rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
