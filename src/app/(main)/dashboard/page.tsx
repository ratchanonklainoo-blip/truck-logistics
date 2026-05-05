'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  Truck, Fuel, TrendingUp, DollarSign, Users,
  AlertCircle, BarChart3, Gauge, Building2, Calendar,
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

  useEffect(() => {
    const load = async () => {
      const [{ data: driverData }, { data: tripData }] = await Promise.all([
        supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
        supabase.from('trips').select('*').is('deleted_at', null),
      ]);
      setDrivers(driverData || []);
      setAllTrips(tripData  || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => load())
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
