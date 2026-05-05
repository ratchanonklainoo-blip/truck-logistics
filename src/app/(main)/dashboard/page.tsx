'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  Truck, Fuel, TrendingUp, DollarSign, Users,
  AlertCircle, BarChart3, Gauge, Building2, Calendar, Receipt,
} from 'lucide-react';
import type { Trip, Driver } from '@/types';
import {
  COMPANY, THAI_MONTHS, BUDDHIST_ERA_OFFSET, CHART_COLORS,
} from '@/lib/constants';
import {
  formatCurrency, formatNumber, calcFuelEfficiency,
  isDateInFilter, getCurrentMonthFilter, getThaiMonthLabel,
} from '@/lib/utils';

interface DriverStat {
  driver:          Driver;
  nickname:        string;
  revenue:         number;
  trip_pay:        number;
  fuel_cost:       number;
  other_cost:      number;
  trips:           number;
  distance:        number;
  fuel_litres:     number;
  fuel_efficiency: number;
}

// Custom tooltip for Recharts
const ThaiTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm font-sarabun">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatNumber(p.value)} บาท
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const supabase = createClient();

  const [drivers,     setDrivers]     = useState<Driver[]>([]);
  const [allTrips,    setAllTrips]    = useState<Trip[]>([]);
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthFilter());
  const [loading,     setLoading]     = useState(true);
  const [jobStats, setJobStats] = useState({
    active: 0, inProgress: 0, waitingPayment: 0, waitingFuel: 0,
    todayCash: 0, pendingAdvances: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [{ data: driverData }, { data: tripData }, { data: jobData }, { data: fuelData }, { data: advData }] = await Promise.all([
        supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
        supabase.from('trips').select('*').is('deleted_at', null),
        supabase.from('jobs').select('status, selling_price, date').is('deleted_at', null),
        supabase.from('fuel_events').select('status').is('deleted_at', null),
        supabase.from('advance_requests').select('amount').eq('status', 'pending').is('deleted_at', null),
      ]);
      setDrivers(driverData || []);
      setAllTrips(tripData  || []);

      const jobs = jobData || [];
      const today = new Date().toISOString().slice(0, 10);
      setJobStats({
        active:         jobs.filter(j => !['closed'].includes(j.status)).length,
        inProgress:     jobs.filter(j => j.status === 'in_progress').length,
        waitingPayment: jobs.filter(j => j.status === 'waiting_payment').length,
        waitingFuel:    (fuelData || []).filter(f => ['waiting_approval','needs_review'].includes(f.status)).length,
        todayCash:      jobs.filter(j => j.status === 'closed' && j.date === today).reduce((s, j) => s + (j.selling_price || 0), 0),
        pendingAdvances:(advData || []).length,
      });

      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_events' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const monthTrips = useMemo(() =>
    allTrips.filter(t => isDateInFilter(t.date, monthFilter)),
  [allTrips, monthFilter]);

  // ── Company stats ─────────────────────────────────────────
  const companyStats = useMemo(() => {
    const totalRevenue = monthTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
    const totalTripPay = monthTrips.reduce((s, t) => s + (t.trip_pay        || 0), 0);
    const totalFuel    = monthTrips.reduce((s, t) => s + (t.fuel_cost       || 0), 0);
    const totalOther   = monthTrips.reduce((s, t) => s + (t.other_cost      || 0), 0);
    const totalSalary  = drivers.length * (drivers[0]?.base_salary || 5000);
    const totalExpenses = totalTripPay + totalFuel + totalOther + totalSalary;
    return {
      totalRevenue, totalTripPay, totalFuel, totalOther,
      totalSalary, totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      totalTrips: monthTrips.length,
    };
  }, [monthTrips, drivers]);

  // ── Per-driver stats ──────────────────────────────────────
  const driverStats: DriverStat[] = useMemo(() =>
    drivers.map(d => {
      const dTrips = monthTrips.filter(t => t.driver_id === d.id);
      const revenue     = dTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
      const trip_pay    = dTrips.reduce((s, t) => s + (t.trip_pay        || 0), 0);
      const fuel_cost   = dTrips.reduce((s, t) => s + (t.fuel_cost       || 0), 0);
      const other_cost  = dTrips.reduce((s, t) => s + (t.other_cost      || 0), 0);
      const distance    = dTrips.reduce((s, t) => s + (t.distance        || 0), 0);
      const fuel_litres = dTrips.reduce((s, t) => s + (t.fuel_litres     || 0), 0);
      return {
        driver: d, nickname: d.nickname,
        revenue, trip_pay, fuel_cost, other_cost,
        trips: dTrips.length, distance, fuel_litres,
        fuel_efficiency: calcFuelEfficiency(distance, fuel_litres),
      };
    }),
  [drivers, monthTrips]);

  // ── Other expenses breakdown ──────────────────────────────
  const otherExpenseBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; count: number; byDriver: Record<string, number> }>();
    monthTrips.forEach(t => {
      if (!t.other_cost || t.other_cost === 0) return;
      const key = t.other_item?.trim() || 'ไม่ระบุรายการ';
      const driver = drivers.find(d => d.id === t.driver_id);
      const driverName = driver?.nickname || '-';
      if (!map.has(key)) map.set(key, { total: 0, count: 0, byDriver: {} });
      const entry = map.get(key)!;
      entry.total += t.other_cost;
      entry.count += 1;
      entry.byDriver[driverName] = (entry.byDriver[driverName] || 0) + t.other_cost;
    });
    return Array.from(map.entries())
      .map(([item, data]) => ({ item, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [monthTrips, drivers]);

  // ── 6-month trend ─────────────────────────────────────────
  const trendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const filter = { month_index: d.getMonth(), year_be: d.getFullYear() + BUDDHIST_ERA_OFFSET };
      const trips = allTrips.filter(t => isDateInFilter(t.date, filter));
      const revenue  = trips.reduce((s, t) => s + (t.transport_price || 0), 0);
      const expenses = trips.reduce((s, t) => s + (t.fuel_cost || 0) + (t.other_cost || 0) + (t.trip_pay || 0), 0);
      return {
        month:    THAI_MONTHS[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear() + BUDDHIST_ERA_OFFSET).slice(2),
        รายรับ:  revenue,
        รายจ่าย: expenses,
      };
    });
  }, [allTrips]);

  const barData = driverStats.map(d => ({
    name:       d.nickname,
    'ค่าขนส่ง': d.revenue,
    'ค่าเที่ยว': d.trip_pay,
    'ค่าน้ำมัน': d.fuel_cost,
  }));

  const monthLabel = getThaiMonthLabel(monthFilter);
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const now = new Date();
    return now.getFullYear() + BUDDHIST_ERA_OFFSET - i;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" /> ศูนย์ควบคุม
          </h1>
          <p className="text-slate-500 text-sm">{COMPANY.name}</p>
        </div>
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

      {/* Live Job Status Row */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'งานที่เปิดอยู่',   value: jobStats.active,          color: 'bg-blue-600',   sub: 'ทุกสถานะ' },
          { label: 'กำลังวิ่ง',        value: jobStats.inProgress,      color: 'bg-orange-500', sub: 'บนถนนตอนนี้' },
          { label: 'รอรับเงิน',        value: jobStats.waitingPayment,  color: 'bg-purple-500', sub: 'ลูกค้าค้างจ่าย' },
          { label: 'รอตรวจน้ำมัน',    value: jobStats.waitingFuel,     color: 'bg-yellow-500', sub: 'รออนุมัติ' },
          { label: 'รายได้วันนี้',     value: formatCurrency(jobStats.todayCash), color: 'bg-green-600', sub: 'งานปิดวันนี้' },
          { label: 'รออนุมัติเบิก',   value: jobStats.pendingAdvances, color: 'bg-red-500',    sub: 'advance requests' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm text-center">
            <div className={`w-8 h-1.5 rounded-full ${color} mx-auto mb-2`} />
            <div className="text-lg font-bold text-slate-800">{value}</div>
            <div className="text-xs font-semibold text-slate-600 leading-tight">{label}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: TrendingUp, label: 'รายรับรวม',
            value: formatCurrency(companyStats.totalRevenue),
            color: 'border-green-500 text-green-600 bg-green-50',
          },
          {
            icon: Fuel, label: 'ค่าน้ำมันรวม',
            value: formatCurrency(companyStats.totalFuel),
            color: 'border-blue-500 text-blue-600 bg-blue-50',
          },
          {
            icon: DollarSign, label: 'รายจ่ายรวม',
            value: formatCurrency(companyStats.totalExpenses),
            color: 'border-red-500 text-red-600 bg-red-50',
          },
          {
            icon: companyStats.netProfit >= 0 ? TrendingUp : AlertCircle,
            label: 'กำไรสุทธิ',
            value: formatCurrency(companyStats.netProfit),
            color: companyStats.netProfit >= 0
              ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
              : 'border-red-500 text-red-600 bg-red-50',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className={`stat-card border-l-4 ${color}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label} ({monthLabel})</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
              <Icon className="w-8 h-8 opacity-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Driver stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {driverStats.map(d => (
          <div key={d.driver.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">{d.driver.name}</h3>
                <p className="text-xs text-slate-400">{d.driver.license_plate}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400">จำนวนเที่ยว</p>
                <p className="text-xl font-bold text-blue-600">{d.trips}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-slate-500">ค่าขนส่ง</p>
                <p className="font-bold text-green-700 text-sm">{formatCurrency(d.revenue)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-xs text-slate-500">น้ำมัน</p>
                <p className="font-bold text-blue-700 text-sm">{formatCurrency(d.fuel_cost)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-xs text-slate-500">สิ้นเปลือง</p>
                <p className="font-bold text-orange-700 text-sm">
                  {d.fuel_efficiency > 0 ? `${d.fuel_efficiency} กม./ล.` : '-'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Other Expenses Breakdown */}
      {otherExpenseBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-500" />
              รายละเอียดค่าอื่นๆ — {monthLabel}
            </h3>
            <span className="text-sm font-bold text-orange-600">
              รวม: {formatCurrency(companyStats.totalOther)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
                  <th className="px-5 py-3 text-left">รายการ</th>
                  {drivers.map(d => (
                    <th key={d.id} className="px-4 py-3 text-right">{d.nickname}</th>
                  ))}
                  <th className="px-4 py-3 text-right">ครั้ง</th>
                  <th className="px-5 py-3 text-right">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {otherExpenseBreakdown.map((row, i) => (
                  <tr key={row.item} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-5 py-3 font-medium text-slate-700">{row.item}</td>
                    {drivers.map(d => (
                      <td key={d.id} className="px-4 py-3 text-right text-slate-600">
                        {row.byDriver[d.nickname]
                          ? formatCurrency(row.byDriver[d.nickname])
                          : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">{row.count} ครั้ง</td>
                    <td className="px-5 py-3 text-right font-bold text-orange-600">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200 font-bold">
                  <td className="px-5 py-3 text-slate-700">รวมค่าอื่นๆ ทั้งหมด</td>
                  {drivers.map(d => {
                    const dTotal = otherExpenseBreakdown.reduce(
                      (s, r) => s + (r.byDriver[d.nickname] || 0), 0
                    );
                    return (
                      <td key={d.id} className="px-4 py-3 text-right text-orange-700">
                        {dTotal > 0 ? formatCurrency(dTotal) : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">
                    {otherExpenseBreakdown.reduce((s, r) => s + r.count, 0)} ครั้ง
                  </td>
                  <td className="px-5 py-3 text-right text-orange-600 text-base">
                    {formatCurrency(companyStats.totalOther)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue/Expense comparison */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            เปรียบเทียบรายรับ-รายจ่าย ({monthLabel})
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontFamily: 'Sarabun', fontSize: 13 }} />
              <YAxis tick={{ fontFamily: 'Sarabun', fontSize: 11 }} tickFormatter={v => formatNumber(v)} />
              <Tooltip content={<ThaiTooltip />} />
              <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
              <Bar dataKey="ค่าขนส่ง" fill={CHART_COLORS.revenue} radius={[4,4,0,0]} />
              <Bar dataKey="ค่าเที่ยว" fill={CHART_COLORS.profit}  radius={[4,4,0,0]} />
              <Bar dataKey="ค่าน้ำมัน" fill={CHART_COLORS.fuel}   radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fuel efficiency */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-orange-500" />
            อัตราสิ้นเปลือง (กม./ลิตร) — {monthLabel}
          </h3>
          <div className="flex items-end justify-around h-48 gap-4 px-4">
            {driverStats.map(d => {
              const maxEff = Math.max(...driverStats.map(x => x.fuel_efficiency), 5);
              const heightPct = maxEff > 0 ? (d.fuel_efficiency / maxEff) * 100 : 0;
              return (
                <div key={d.driver.id} className="flex flex-col items-center flex-1">
                  <p className="text-2xl font-bold text-orange-600 mb-2">
                    {d.fuel_efficiency > 0 ? d.fuel_efficiency : '-'}
                  </p>
                  <div
                    className="w-full rounded-t-lg transition-all duration-700"
                    style={{ height: `${Math.max(heightPct, 8)}%`, backgroundColor: CHART_COLORS.other }}
                  />
                  <p className="mt-2 text-sm font-medium text-slate-600">{d.nickname}</p>
                  <p className="text-xs text-slate-400">{formatNumber(d.distance)} กม.</p>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">*ยิ่งสูงยิ่งประหยัดน้ำมัน</p>
        </div>

        {/* 6-Month trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            แนวโน้ม 6 เดือนย้อนหลัง
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontFamily: 'Sarabun', fontSize: 12 }} />
              <YAxis tick={{ fontFamily: 'Sarabun', fontSize: 11 }} tickFormatter={v => formatNumber(v)} />
              <Tooltip content={<ThaiTooltip />} />
              <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
              <Line type="monotone" dataKey="รายรับ"  stroke={CHART_COLORS.revenue} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="รายจ่าย" stroke={CHART_COLORS.expense} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
