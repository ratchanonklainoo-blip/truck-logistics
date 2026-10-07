'use client';

// กำไรรายเที่ยว — หน้าสรุปอ่านอย่างเดียว (สูตรที่ lib/tripProfit.ts ผ่าน /api/reports/trip-profit)
// ไม่มีการแก้ข้อมูลในหน้านี้ ; แก้เที่ยวที่หน้าเที่ยววิ่งเดิม
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw, Image as ImageIcon, X, ExternalLink } from 'lucide-react';
import { formatCurrency, formatNumber, formatThaiDate, adToBE } from '@/lib/utils';
import { THAI_MONTHS } from '@/lib/constants';
import { todayBangkok } from '@/lib/dateTh';
import { summarizeTrips, reconcileWithMonthlyReport, type TripProfitResult, type TPTrip, type TPDay, type ProfitColor } from '@/lib/tripProfit';

// เฉพาะฟิลด์ที่ใช้กระทบยอดจาก /api/reports/monthly
interface MonthlyReportLite {
  totals: { net_profit: number; total_driver_cost: number; total_extra_expenses: number };
  driver_summaries: { total_commission: number }[];
}

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
const signed = (n: number) => `${n < 0 ? '−' : '+'}${baht(Math.abs(n))}`;
const COLOR_BORDER: Record<ProfitColor, string> = { green: 'border-l-emerald-500', yellow: 'border-l-amber-400', red: 'border-l-red-500' };

// ใช้ทั้งตาราง (จอใหญ่) และการ์ด (จอ ≤ 640px)
function FuelCell({ t }: { t: TPTrip }) {
  if (t.fuel_mode === 'no_data') return <span className="text-xs text-slate-400">ไม่มีข้อมูลน้ำมัน/ระยะทาง</span>;
  if (t.group_host) return <>{baht(t.fuel)}<div className="text-[10px] text-slate-400">น้ำมันอยู่ที่รอบ {t.group_host}</div></>;
  return <>{baht(t.fuel)}{t.fuel_mode === 'estimate' && <div className="text-xs font-semibold text-amber-600">ประมาณการ</div>}</>;
}

/** กลุ่มไมล์: เที่ยวหลักแสดงกำไรทั้งกลุ่ม ; เที่ยวไมล์ 0 ในกลุ่มอ้างกลับไปที่เที่ยวหลัก (ไม่แทนกำไรรายเที่ยว) */
function GroupNote({ t }: { t: TPTrip }) {
  if (t.group_profit != null)
    return <div className={`text-xs font-semibold whitespace-nowrap ${t.group_profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>กำไรทั้งกลุ่ม {signed(t.group_profit)} ({t.group_size} เที่ยว)</div>;
  if (t.group_host)
    return <div className="text-xs font-normal text-slate-500 whitespace-nowrap">ดูกำไรทั้งกลุ่มที่รอบ {t.group_host}</div>;
  return null;
}

function DayNotes({ d }: { d: TPDay }) {
  const none = !d.hints.length && !d.fuel_estimated && !d.off_trip.rows && !(d.trip_count === 0 && d.fuel_own !== 0);
  return (
    <>
      {d.hints.map(h => (
        <div key={h.row_id} className="font-medium text-amber-700">
          ⚠ น้ำมันนี้ ({baht(h.amount)}) น่าจะเป็นของเที่ยว {h.route} วันที่ {formatThaiDate(h.trip_date, true)}
        </div>
      ))}
      {d.trip_count === 0 && d.fuel_own !== 0 && !d.hints.length && <div className="text-amber-700">ไม่มีเที่ยว — น้ำมันเป็นต้นทุนของวันนี้</div>}
      {d.fuel_estimated > 0 && <div className="text-slate-400">รายเที่ยวใช้น้ำมันประมาณการ {baht(d.fuel_estimated)}{d.est_rate ? ` (${baht(d.est_rate)} บ./กม.)` : ''} ไม่นับในต้นทุนวัน</div>}
      {d.off_trip.rows > 0 && <div className="text-slate-500">
        นอกเที่ยว {d.off_trip.rows} แถว{d.off_trip.km ? ` · วิ่งเปล่า ${formatNumber(d.off_trip.km)} กม.` : ''}
        {d.off_trip.other ? ` · ค่าใช้จ่ายอื่น ${baht(d.off_trip.other)}` : ''}
      </div>}
      {none && '-'}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 break-words">{children}</div>
    </div>
  );
}

function TripCard({ t, margin, onPreview }: { t: TPTrip; margin: string; onPreview: (url: string) => void }) {
  return (
    <div className={`px-3 py-3 border-b border-b-slate-100 border-l-4 ${COLOR_BORDER[t.color]} ${COLOR_ROW[t.color]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{formatThaiDate(t.date, true)} · รอบ {t.round}</div>
          <div className="text-xs text-slate-500 break-words">{t.driver_name} · {t.plate_label}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-base font-bold ${COLOR_TEXT[t.color]}`}>{baht(t.profit)}</div>
          <GroupNote t={t} />
        </div>
      </div>
      <div className="mt-1 text-sm break-words">
        <span className="font-medium text-slate-700">{t.product || '-'}</span>
        <span className="text-xs text-slate-500"> · {t.origin || '-'} → {t.destination || '-'}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
        <Field label="รายได้">{baht(t.revenue)}</Field>
        <Field label="ค่าน้ำมันจัดสรร"><FuelCell t={t} /></Field>
        <Field label="ค่าเที่ยว">{baht(t.pay)}</Field>
        <Field label="ต้นทุนรวม">{baht(t.cost)}</Field>
        <Field label="ระยะทาง (กม.)"><span className={t.km ? '' : 'text-xs text-slate-400'}>{kmLabel(t)}</span></Field>
        <Field label={`ต้นทุน/กม.${t.group_size > 1 ? ' (ทั้งกลุ่ม)' : ''}`}>{t.cost_per_km == null ? '-' : baht(t.cost_per_km)}</Field>
        <Field label="กำไร/กม.">{t.profit_per_km == null ? '-' : baht(t.profit_per_km)}</Field>
        <Field label={`ขั้นต่ำควรรับ (${margin}%)`}>
          {t.min_price == null ? '-' : baht(t.min_price)}
          {t.min_price != null && t.revenue < t.min_price && <div className="text-xs text-red-600">รับต่ำกว่าขั้นต่ำ</div>}
        </Field>
      </div>
      <div className="flex items-center justify-end gap-4 mt-2 text-xs">
        {t.receipt_image_url && (
          <button onClick={() => onPreview(t.receipt_image_url!)} className="inline-flex items-center gap-1 text-blue-600 py-1"><ImageIcon className="w-4 h-4" />ดูรูป</button>
        )}
        <Link href="/trips" className="inline-flex items-center gap-1 text-blue-600 py-1">แก้ที่เที่ยววิ่ง <ExternalLink className="w-3 h-3" /></Link>
      </div>
    </div>
  );
}

function DayCard({ d }: { d: TPDay }) {
  const c = profitColorOf(d.profit, d.revenue);
  return (
    <div className={`px-3 py-3 border-b border-b-slate-100 border-l-4 ${d.trip_count === 0 ? 'border-l-slate-300 bg-slate-50' : `${COLOR_BORDER[c]} ${COLOR_ROW[c]}`}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{formatThaiDate(d.date, true)}</div>
          <div className="text-xs text-slate-500 break-words">{d.plate_label} · {d.drivers.join(', ')}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-slate-500">กำไรวัน</div>
          <div className={`text-base font-bold ${COLOR_TEXT[c]}`}>{baht(d.profit)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
        <Field label="เที่ยว">{d.trip_count || '-'}</Field>
        <Field label="กม.วิ่งจริง">{d.km ? formatNumber(d.km) : '-'}</Field>
        <Field label="น้ำมันที่เติม">{d.fuel_own ? <>{baht(d.fuel_own)}{d.fills > 1 && <span className="text-xs text-slate-400"> (เติม {d.fills} ครั้ง)</span>}</> : '-'}</Field>
        <Field label="ค่าเที่ยว">{d.pay ? baht(d.pay) : '-'}</Field>
        <Field label="ต้นทุนวัน">{baht(d.cost)}</Field>
        <Field label="รายได้">{d.revenue ? baht(d.revenue) : '-'}</Field>
        <Field label="ต้นทุน/กม.">{d.cost_per_km == null ? '-' : baht(d.cost_per_km)}</Field>
      </div>
      <div className="mt-2 text-xs break-words space-y-0.5"><DayNotes d={d} /></div>
    </div>
  );
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

  // รายงานรายเดือนเดิม (อ่านอย่างเดียว) — ใช้แสดงบรรทัดกระทบยอดว่าตัวเลขหน้านี้ไม่ขัดกับรายงาน
  const [report, setReport] = useState<MonthlyReportLite | null>(null);
  const [reportError, setReportError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setReport(null); setReportError('');
    (async () => {
      try {
        const res = await fetch(`/api/reports/monthly?month_year=${monthYear}`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setReportError(j.error || `โหลดรายงานรายเดือนไม่สำเร็จ (${res.status})`);
        else setReport(j.data);
      } catch (e) {
        if (!cancelled) setReportError(e instanceof Error ? e.message : 'โหลดรายงานรายเดือนไม่สำเร็จ');
      }
    })();
    return () => { cancelled = true; };
  }, [monthYear, reloadKey]);

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
  // Daily Summary กรองได้เฉพาะวัน/รถ/คนขับ (ยอดของวันเป็นของรถทั้งคัน ไม่แยกตามสินค้า/เส้นทาง)
  const days = useMemo(() => (data?.days || []).filter(d =>
    (!fDate || d.date === fDate) && (!fVehicle || d.vehicle === fVehicle) && (!fDriver || d.drivers.includes(fDriver))),
  [data, fDate, fVehicle, fDriver]);
  const recon = useMemo(() => {
    if (!data || !report) return null;
    const commission = report.driver_summaries.reduce((a, s) => a + (Number(s.total_commission) || 0), 0);
    return reconcileWithMonthlyReport(data.totals, { ...report.totals, total_commission: commission });
  }, [data, report]);
  const daySum = (f: (d: (typeof days)[number]) => number) => Math.round(days.reduce((a, d) => a + Math.round(f(d) * 100), 0)) / 100;

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
              tone={totals.profit_after_other < 0 ? 'text-red-600' : 'text-emerald-700'} sub="ยังไม่หักน้ำมันวันไม่มีเที่ยว/เงินเดือนฐาน/ค่าใช้จ่ายประจำ" />
            <Card label="น้ำมันวันที่ไม่มีเที่ยว" value={formatCurrency(daySum(d => d.fuel_no_trip))} tone="text-orange-700"
              sub="ไม่ได้ลงเที่ยวใด · ดูป้ายเตือนในสรุปรายวัน" />
          </div>

          {/* ── ตารางรายเที่ยว ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 text-sm">รายเที่ยว ({trips.length})</span>
              <span className="text-xs text-slate-500">
                <span className="text-emerald-700">● กำไร</span> · <span className="text-amber-600">● กำไรต่ำกว่า 10%</span> · <span className="text-red-600">● ขาดทุน</span>
              </span>
            </div>
            {/* จอ ≤ 640px: การ์ด */}
            <div className="[@media(min-width:641px)]:hidden">
              {trips.length === 0 && <div className="text-center py-10 text-slate-400">ไม่มีเที่ยวในเดือน/ตัวกรองนี้</div>}
              {trips.map(t => <TripCard key={t.id} t={t} margin={marginOk ? marginPct : '-'} onPreview={setPreview} />)}
              {trips.length > 0 && (
                <div className="px-3 py-3 bg-slate-100 grid grid-cols-2 gap-x-3 gap-y-2 font-semibold">
                  <div className="col-span-2 text-sm text-slate-700">รวม {totals.trip_count} เที่ยว · {formatNumber(totals.km)} กม.</div>
                  <Field label="รายได้">{baht(totals.revenue)}</Field>
                  <Field label="ค่าน้ำมันจัดสรร">{baht(totals.fuel_actual + totals.fuel_estimated)}</Field>
                  <Field label="ค่าเที่ยว">{baht(totals.pay)}</Field>
                  <Field label="ต้นทุนรวม">{baht(totals.cost)}</Field>
                  <Field label="กำไร/ขาดทุน"><span className={COLOR_TEXT[profitColorOf(totals.profit, totals.revenue)]}>{baht(totals.profit)}</span></Field>
                  <Field label="ต้นทุน/กม.">{totals.cost_per_km == null ? '-' : baht(totals.cost_per_km)}</Field>
                </div>
              )}
            </div>
            <div className="hidden [@media(min-width:641px)]:block overflow-x-auto">
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
                      <td className="px-3 py-2 text-right whitespace-nowrap"><FuelCell t={t} /></td>
                      <td className="px-3 py-2 text-right">{baht(t.pay)}</td>
                      <td className="px-3 py-2 text-right">{baht(t.cost)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{t.cost_per_km == null ? '-' : baht(t.cost_per_km)}{t.group_size > 1 && <div className="text-[10px] text-slate-400">ทั้งกลุ่ม</div>}</td>
                      <td className="px-3 py-2 text-right">{baht(t.revenue)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${COLOR_TEXT[t.color]}`}>{baht(t.profit)}<GroupNote t={t} /></td>
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
              <div>ค่าน้ำมันของรถแต่ละวัน = ผลรวมค่าน้ำมันที่เติมในวันนั้น (ไม่ยกข้ามวัน) กระจายตามระยะทาง · เที่ยวไมล์ 0 ในรอบน้ำมันเดียวกันได้ 0 (น้ำมันอยู่ที่เที่ยวที่มีไมล์)</div>
              <div>วันที่ไม่ได้เติมน้ำมัน ใช้ต้นทุนน้ำมัน/กม. เฉลี่ย 30 วันก่อนหน้าของรถคันนั้น (ประมาณการ) · ต้นทุน/กม. และกำไร/กม. ไม่นับเที่ยวที่ไม่ทราบระยะ</div>
            </div>
          </div>
          {filtersOn && <div className="text-xs text-slate-500">ตัวเลขด้านบนเป็นผลรวมตามตัวกรอง — การจัดสรรน้ำมันคำนวณจากทั้งเดือนก่อนกรอง</div>}

          {/* ── Daily Summary รายวัน/รายคัน ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 text-sm">สรุปรายวัน / รายคัน ({days.length})</span>
              {(fProduct || fRoute.trim()) && <span className="text-xs text-amber-600">ส่วนนี้ไม่กรองตามสินค้า/เส้นทาง (ยอดของวันเป็นของรถทั้งคัน)</span>}
            </div>
            {/* จอ ≤ 640px: การ์ด */}
            <div className="[@media(min-width:641px)]:hidden">
              {days.length === 0 && <div className="text-center py-8 text-slate-400">ไม่มีข้อมูล</div>}
              {days.map(d => <DayCard key={`${d.vehicle}|${d.date}`} d={d} />)}
              {days.length > 0 && (
                <div className="px-3 py-3 bg-slate-100 grid grid-cols-2 gap-x-3 gap-y-2 font-semibold">
                  <div className="col-span-2 text-sm text-slate-700">รวม {daySum(d => d.trip_count)} เที่ยว · {formatNumber(daySum(d => d.km))} กม.</div>
                  <Field label="น้ำมันที่เติม">{baht(daySum(d => d.fuel_own))}</Field>
                  <Field label="ค่าเที่ยว">{baht(daySum(d => d.pay))}</Field>
                  <Field label="ต้นทุนวัน">{baht(daySum(d => d.cost))}</Field>
                  <Field label="รายได้">{baht(daySum(d => d.revenue))}</Field>
                  <Field label="กำไรวัน">{baht(daySum(d => d.profit))}</Field>
                  <Field label="ต้นทุน/กม.">{daySum(d => d.km) ? baht(daySum(d => d.cost) / daySum(d => d.km)) : '-'}</Field>
                  <div className="col-span-2 text-xs font-normal text-slate-600">ค่าใช้จ่ายอื่นนอกเที่ยว {baht(daySum(d => d.off_trip.other))}</div>
                </div>
              )}
            </div>
            <div className="hidden [@media(min-width:641px)]:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1E3A5F] text-white text-xs">
                    {['วันที่', 'รถ / คนขับ', 'เที่ยว', 'กม.วิ่งจริง', 'น้ำมันที่เติม', 'ค่าเที่ยว', 'ต้นทุนวัน', 'รายได้', 'กำไรวัน', 'ต้นทุน/กม.', 'หมายเหตุ']
                      .map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i < 2 || i === 10 ? 'text-left' : 'text-right'}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-slate-400">ไม่มีข้อมูล</td></tr>}
                  {days.map(d => (
                    <tr key={`${d.vehicle}|${d.date}`} className={d.trip_count === 0 ? 'bg-slate-50 text-slate-500' : COLOR_ROW[profitColorOf(d.profit, d.revenue)]}>
                      <td className="px-3 py-2 whitespace-nowrap">{formatThaiDate(d.date, true)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{d.plate_label}<div className="text-slate-400">{d.drivers.join(', ')}</div></td>
                      <td className="px-3 py-2 text-right">{d.trip_count || '-'}</td>
                      <td className="px-3 py-2 text-right">{d.km ? formatNumber(d.km) : '-'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {d.fuel_own ? <>{baht(d.fuel_own)}{d.fills > 1 && <div className="text-[10px] text-slate-400">เติม {d.fills} ครั้ง</div>}</> : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">{d.pay ? baht(d.pay) : '-'}</td>
                      <td className="px-3 py-2 text-right">{baht(d.cost)}</td>
                      <td className="px-3 py-2 text-right">{d.revenue ? baht(d.revenue) : '-'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${COLOR_TEXT[profitColorOf(d.profit, d.revenue)]}`}>{baht(d.profit)}</td>
                      <td className="px-3 py-2 text-right">{d.cost_per_km == null ? '-' : baht(d.cost_per_km)}</td>
                      <td className="px-3 py-2 text-xs min-w-[200px]"><DayNotes d={d} /></td>
                    </tr>
                  ))}
                </tbody>
                {days.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-700">
                      <td className="px-3 py-2" colSpan={2}>รวม</td>
                      <td className="px-3 py-2 text-right">{daySum(d => d.trip_count)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(daySum(d => d.km))}</td>
                      <td className="px-3 py-2 text-right">{baht(daySum(d => d.fuel_own))}</td>
                      <td className="px-3 py-2 text-right">{baht(daySum(d => d.pay))}</td>
                      <td className="px-3 py-2 text-right">{baht(daySum(d => d.cost))}</td>
                      <td className="px-3 py-2 text-right">{baht(daySum(d => d.revenue))}</td>
                      <td className="px-3 py-2 text-right">{baht(daySum(d => d.profit))}</td>
                      <td className="px-3 py-2 text-right">{daySum(d => d.km) ? baht(daySum(d => d.cost) / daySum(d => d.km)) : '-'}</td>
                      <td className="px-3 py-2 text-xs">ค่าใช้จ่ายอื่นนอกเที่ยว {baht(daySum(d => d.off_trip.other))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
              ต้นทุนวัน = น้ำมันที่เติมวันนั้น (ทุกครั้ง) + ค่าเที่ยว · กำไรวัน = รายได้ − ต้นทุนวัน · ต้นทุน/กม. = ต้นทุนวัน ÷ กม. ที่วิ่งจริงของวัน (รวมวิ่งเปล่า) · ไม่ยกน้ำมันข้ามวัน ไม่ใช้ประมาณการ · ค่าใช้จ่ายอื่นแยกอยู่ด้านล่าง
            </div>
          </div>

          {/* ── ค่าใช้จ่ายอื่นของเดือน (ไม่ใช่ต้นทุนเที่ยว) ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 text-sm">ค่าใช้จ่ายอื่นของเดือน ({others.length} รายการ)</span>
              <span className="text-xs text-slate-500">ค่าใช้จ่ายของบริษัททั้งเดือน ไม่นำไปคิดเป็นต้นทุนของเที่ยวใด</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1E3A5F] text-white text-xs">
                    {['วันที่', 'รถ / คนขับ', 'รายการ', 'หมายเหตุ', 'เที่ยว', 'จำนวนเงิน'].map((h, i) =>
                      <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {others.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">
                      {fProduct || fRoute.trim() ? 'ไม่แสดงเมื่อกรองสินค้า/เส้นทาง' : 'ไม่มีค่าใช้จ่ายอื่นในเดือน/ตัวกรองนี้'}
                    </td></tr>
                  )}
                  {others.map(o => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{formatThaiDate(o.date, true)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{o.plate_label}<div className="text-slate-400">{o.driver_name}</div></td>
                      <td className="px-3 py-2 font-medium text-slate-700">{o.item || '-'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{o.remarks || '-'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{o.route || 'ไม่ใช่เที่ยว (ซ่อม/วิ่งเปล่า)'}</td>
                      <td className="px-3 py-2 text-right">{baht(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {others.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-700">
                      <td className="px-3 py-2" colSpan={5}>รวมค่าใช้จ่ายอื่นของเดือน</td>
                      <td className="px-3 py-2 text-right">{baht(totals.other_expenses)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ── กระทบยอดกับรายงานรายเดือน (เฉพาะเมื่อไม่กรอง) ── */}
          {!filtersOn && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm">
              <div className="font-semibold text-slate-700 mb-2">กระทบยอดกับรายงานรายเดือน (กำไรก่อนหักค่าใช้จ่ายประจำ)</div>
              {reportError && <div className="text-red-600 text-xs">{reportError}</div>}
              {!recon && !reportError && <div className="text-slate-400 text-xs">กำลังโหลดรายงานรายเดือน...</div>}
              {recon && (
                <div className="max-w-xl space-y-1">
                  {recon.lines.filter(l => l.amount !== 0 || l.label === 'กำไรจากเที่ยว').map(l => (
                    <div key={l.label} className="flex justify-between gap-4">
                      <span className="text-slate-600">{l.label}</span>
                      <span className={l.amount < 0 ? 'text-red-600' : 'text-slate-800'}>{l.amount < 0 ? '−' : '+'}{baht(Math.abs(l.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 font-semibold">
                    <span>= กำไรตามรายงานรายเดือน</span><span>{baht(recon.total)}</span>
                  </div>
                  <div className={`text-xs ${recon.diff === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {recon.diff === 0
                      ? `✓ ตรงกับรายงานรายเดือน (${baht(recon.report_net_profit)})`
                      : `⚠ ต่างจากรายงานรายเดือน (${baht(recon.report_net_profit)}) อยู่ ${baht(recon.diff)} — แจ้งผู้ดูแลระบบ`}
                  </div>
                </div>
              )}
            </div>
          )}
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
