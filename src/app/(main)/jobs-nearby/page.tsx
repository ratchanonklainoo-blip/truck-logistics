'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Navigation, MapPin, Package, Banknote, TrendingUp,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { formatCurrency, formatNumber, haversineKm } from '@/lib/utils';
import SaveLocationInline from '@/components/drivers/SaveLocationInline';
import MapsLink from '@/components/ui/MapsLink';

interface DriverRow {
  id: string; nickname: string; name: string; license_plate: string;
}
interface JobRow {
  id: string; job_number: string; origin: string; destination: string;
  origin_lat: number; origin_lng: number;
  destination_lat: number | null; destination_lng: number | null;
  product: string | null; weight_kg: number | null; selling_price: number;
  status: string;
}
interface TruckLoc { lat: number; lng: number; recorded_at: string; }

interface JobCandidate {
  job: JobRow;
  pickupKm: number;
  legKm: number | null;
  totalKm: number | null;
  bahtPerKm: number | null;
}

const RADIUS_OPTIONS = [
  { value: 0,   label: 'ไม่จำกัดระยะ' },
  { value: 20,  label: '20 กม.' },
  { value: 50,  label: '50 กม.' },
  { value: 100, label: '100 กม.' },
];

export default function JobsNearbyPage() {
  const [supabase] = useState(() => createClient());
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [truckLocations, setTruckLocations] = useState<Record<string, TruckLoc>>({});
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsMissingCoords, setJobsMissingCoords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [radiusKm, setRadiusKm] = useState(0);
  const [sortBy, setSortBy] = useState<'value' | 'distance'>('value');
  const [editingLocFor, setEditingLocFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: drData }, { data: locData }, { data: jobData }] = await Promise.all([
      supabase.from('drivers').select('id,nickname,name,license_plate')
        .eq('is_active', true).is('deleted_at', null).order('nickname'),
      supabase.from('truck_locations').select('driver_id,lat,lng,recorded_at')
        .order('recorded_at', { ascending: false }),
      supabase.from('jobs').select('id,job_number,origin,destination,origin_lat,origin_lng,destination_lat,destination_lng,product,weight_kg,selling_price,status')
        .in('status', ['new', 'waiting_driver']).is('assigned_driver_id', null).is('deleted_at', null),
    ]);

    const locMap: Record<string, TruckLoc> = {};
    (locData || []).forEach(l => {
      if (!locMap[l.driver_id]) locMap[l.driver_id] = { lat: l.lat, lng: l.lng, recorded_at: l.recorded_at };
    });

    const allJobs = jobData || [];
    const withCoords = allJobs.filter(j => j.origin_lat !== null && j.origin_lng !== null) as JobRow[];

    setDrivers(drData || []);
    setTruckLocations(locMap);
    setJobs(withCoords);
    setJobsMissingCoords(allJobs.length - withCoords.length);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const candidatesByDriver = useMemo(() => {
    const map: Record<string, JobCandidate[]> = {};
    drivers.forEach(d => {
      const loc = truckLocations[d.id];
      if (!loc) { map[d.id] = []; return; }
      let list: JobCandidate[] = jobs.map(job => {
        const pickupKm = haversineKm(loc.lat, loc.lng, job.origin_lat, job.origin_lng);
        const legKm = (job.destination_lat !== null && job.destination_lng !== null)
          ? haversineKm(job.origin_lat, job.origin_lng, job.destination_lat, job.destination_lng)
          : null;
        const totalKm = legKm !== null ? pickupKm + legKm : null;
        const bahtPerKm = (totalKm !== null && totalKm > 0) ? job.selling_price / totalKm : null;
        return { job, pickupKm, legKm, totalKm, bahtPerKm };
      });
      if (radiusKm > 0) list = list.filter(c => c.pickupKm <= radiusKm);
      list.sort((a, b) => sortBy === 'value'
        ? (b.bahtPerKm ?? -1) - (a.bahtPerKm ?? -1)
        : a.pickupKm - b.pickupKm);
      map[d.id] = list;
    });
    return map;
  }, [drivers, truckLocations, jobs, radiusKm, sortBy]);

  const bestJobIdByDriver = useMemo(() => {
    const map: Record<string, string | null> = {};
    Object.entries(candidatesByDriver).forEach(([driverId, list]) => {
      const withValue = list.filter(c => c.bahtPerKm !== null);
      const best = withValue.reduce<JobCandidate | null>((acc, c) =>
        !acc || (c.bahtPerKm! > acc.bahtPerKm!) ? c : acc, null);
      map[driverId] = best ? best.job.id : null;
    });
    return map;
  }, [candidatesByDriver]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Navigation className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">งานใกล้รถ</h1>
            <p className="text-sm text-slate-500">
              จับคู่งานที่ยังไม่จัดรถกับตำแหน่งรถแต่ละคัน เรียงตามความคุ้มค่า (บาท/กม.)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="form-input text-sm !w-auto"
            value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
          >
            {RADIUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="form-input text-sm !w-auto"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'value' | 'distance')}
          >
            <option value="value">เรียง: คุ้มเที่ยวที่สุด</option>
            <option value="distance">เรียง: ใกล้ที่สุด</option>
          </select>
          <button onClick={load} className="btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" /> รีเฟรช
          </button>
        </div>
      </div>

      {jobsMissingCoords > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          มีงานที่ยังไม่จัดรถอีก {jobsMissingCoords} งานที่ยังไม่ได้กรอกพิกัดต้นทาง — จะไม่แสดงในหน้านี้จนกว่าจะกรอกพิกัดที่หน้า &quot;งานเข้า&quot;
        </div>
      )}

      {/* Per-driver cards */}
      <div className="space-y-4">
        {drivers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            ยังไม่มีคนขับในระบบ
          </div>
        ) : drivers.map(d => {
          const loc = truckLocations[d.id];
          const candidates = candidatesByDriver[d.id] || [];
          const bestJobId = bestJobIdByDriver[d.id];

          return (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{d.nickname}</span>
                  <span className="text-slate-400 text-sm">{d.license_plate}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {loc && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      {' · อัปเดต '}
                      {new Date(loc.recorded_at).toLocaleString('th-TH')}
                      <MapsLink lat={loc.lat} lng={loc.lng} />
                    </span>
                  )}
                  {editingLocFor === d.id ? (
                    <SaveLocationInline
                      driverId={d.id}
                      onSaved={newLoc => {
                        setTruckLocations(p => ({ ...p, [d.id]: newLoc }));
                        setEditingLocFor(null);
                      }}
                      onCancel={() => setEditingLocFor(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingLocFor(d.id)}
                      className="btn-secondary text-xs px-2.5 py-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {loc ? 'แก้ไขตำแหน่ง' : 'กรอกตำแหน่งรถ'}
                    </button>
                  )}
                </div>
              </div>

              {loc && (
                <div className="divide-y divide-slate-100">
                  {candidates.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-400">
                      ไม่มีงานที่ยังไม่จัดรถอยู่ในระยะที่กำหนด
                    </p>
                  ) : candidates.map(c => {
                    const isBest = c.job.id === bestJobId;
                    return (
                      <div key={c.job.id} className={`px-5 py-3 flex items-center gap-4 flex-wrap ${isBest ? 'bg-green-50/60' : ''}`}>
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-400">{c.job.job_number}</span>
                            <span className="font-medium text-slate-800">{c.job.origin} → {c.job.destination}</span>
                            {isBest && (
                              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-semibold">
                                <TrendingUp className="w-3 h-3" /> คุ้มเที่ยวสุด
                              </span>
                            )}
                          </div>
                          {c.job.product && (
                            <span className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                              <Package className="w-3 h-3" />
                              {c.job.product}{c.job.weight_kg ? ` · ${formatNumber(c.job.weight_kg)} กก.` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 justify-end text-sm font-bold text-slate-800">
                            <Banknote className="w-3.5 h-3.5 text-green-600" />
                            {formatCurrency(c.job.selling_price)}
                          </div>
                          <div className="text-xs text-slate-400">
                            ไปรับ {formatNumber(c.pickupKm, 1)} กม.
                            {c.legKm !== null ? ` · วิ่งงาน ${formatNumber(c.legKm, 1)} กม.` : ' · ไม่มีพิกัดปลายทาง'}
                          </div>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <div className={`text-base font-bold ${isBest ? 'text-green-600' : 'text-slate-700'}`}>
                            {c.bahtPerKm !== null ? `${formatNumber(c.bahtPerKm, 1)}` : '—'}
                          </div>
                          <div className="text-xs text-slate-400">บาท/กม.</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
