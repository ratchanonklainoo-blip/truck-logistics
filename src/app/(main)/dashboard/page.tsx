'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Truck, Fuel, TrendingUp, TrendingDown, DollarSign, Users,
  AlertCircle, BarChart3, Gauge, Building2, Calendar, Receipt,
  Plus, ClipboardList, Banknote, Zap,
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

const ThaiTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm font-sarabun">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [drivers,     setDrivers]     = useState<Driver[]>([]);
  const [allTrips,    setAllTrips]    = useState<Trip[]>([]);
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthFilter());
  const [loading,     setLoading]     = useState(true);
  const [jobStats, setJobStats] = useState({
    active: 0, inProgress: 0, waitingPayment: 0, waitingFuel: 0, todayCash: 0, pendingAdvances: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [{ data: dr }, { data: tr }, { data: jobs }, { data: adv }] = await Promise.all([
        supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
        supabase.from('trips').select('*').is('deleted_at', null),
        supabase.from('jobs').select('status, selling_price, date').is('deleted_at', null),
        supabase.from('advance_requests').select('id').eq('status', 'pending').is('deleted_at', null),
      ]);
      setDrivers(dr || []);
      setAllTrips(tr || []);
      const today = new Date().toISOString().slice(0, 10);
      const closedToday = (jobs || []).filter(j => j.status === 'closed' && j.date === today);
      setJobStats({
        active:         (jobs || []).filter(j => j.status !== 'closed').length,
        inProgress:     (jobs || []).filter(j => j.status === 'in_progress').length,
        waitingPayment: (jobs || []).filter(j => j.status === 'waiting_payment').length,
        waitingFuel:    (jobs || []).filter(j => j.status === 'waiting_driver').length,
        todayCash:      closedToday.reduce((s, j) => s + (j.selling_price || 0), 0),
        pendingAdvances: (adv || []).length,
      });
      setLoading(false);
    };
    load();

    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs'  }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const monthTrips = useMemo(() =>
    allTrips.filter(t => isDateInFilter(t.date, monthFilter)),
  [allTrips, monthFilter]);

  const companyStats = useMemo(() => {
    const totalRevenue  = monthTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
    const totalFuel     = monthTrips.reduce((s, t) => s + (t.fuel_cost  || 0), 0);
    const totalOther    = monthTrips.reduce((s, t) => s + (t.other_cost || 0), 0);
    const totalTripPay  = monthTrips.reduce((s, t) => s + (t.trip_pay   || 0), 0);
    const totalExpenses = totalFuel + totalOther + totalTripPay;
    return { totalRevenue, totalFuel, totalOther, totalTripPay, totalExpenses, netProfit: totalRevenue - totalExpenses };
  }, [monthTrips]);

  const driverStats = useMemo<DriverStat[]>(() =>
    drivers.map(driver => {
      const dTrips = monthTrips.filter(t => t.driver_id === driver.id);
      const revenue  = dTrips.reduce((s, t) => s + (t.transport_price || 0), 0);
      const trip_pay = dTrips.reduce((s, t) => s + (t.trip_pay   || 0), 0);
      const fuel_cost  = dTrips.reduce((s, t) => s + (t.fuel_cost  || 0), 0);
      const other_cost = dTrips.reduce((s, t) => s + (t.other_cost || 0), 0);
      const distance   = dTrips.reduce((s, t) => s + (t.distance   || 0), 0);
      const fuel_litres = dTrips.reduce((s, t) => s + (t.fuel_litres || 0), 0);
      return {
        driver, nickname: driver.nickname,
        revenue, trip_pay, fuel_cost, other_cost,
        trips: dTrips.length, distance, fuel_litres,
        fuel_efficiency: calcFuelEfficiency(distance, fuel_litres),
      };
    }),
  [drivers, monthTrips]);

  const otherExpenseBreakdown = useMemo(() => {
    const items: Record<string, { total: number; count: number; byDriver: Record<string, number> }> = {};
    monthTrips.forEach(t => {
      if (!t.expense_notes) return;
      try {
        const notes = typeof t.expense_notes === 'string' ? JSON.parse(t.expense_notes) : t.expense_notes;
        if (!Array.isArray(notes)) return;
        notes.forEach((n: { label: string; amount: number }) => {
          if (!items[n.label]) items[n.label] = { total: 0, count: 0, byDriver: {} };
          items[n.label].total += n.amount;
          items[n.label].count++;
          const driverNick = drivers.find(d => d.id === t.driver_id)?.nickname || 'อื่นๆ';
          items[n.label].byDriver[driverNick] = (items[n.label].byDriver[driverNick] || 0) + n.amount;
        });
      } catch {}
    });
    return Object.entries(items).map(([item, v]) => ({ item, ...v })).sort((a,b) => b.total - a.total);
  }, [monthTrips, drivers]);

  const trendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const filter = { month_index: d.getMonth(), year_be: d.getFullYear() + BUDDHIST_ERA_OFFSET };
      const trips = allTrips.filter(t => isDateInFilter(t.date, filter));
      const revenue  = trips.reduce((s, t) => s + (t.transport_price || 0), 0);
      const expenses = trips.reduce((s, t) => s + (t.fuel_cost || 0) + (t.other_cost || 0) + (t.trip_pay || 0), 0);
      return {
        month: THAI_MONTHS[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear() + BUDDHIST_ERA_OFFSET).slice(2),
        'รายรับ': revenue,
        'รายจ่าย': expenses,
      };
    });
  }, [allTrips]);

  const barData = driverStats.map(d => ({
    name: d.nickname,
    'ค่าขนส่ง': d.revenue,
    'ค่าเที่ยว': d.trip_pay,
    'ค่าน้ำมัน': d.fuel_cost,
  }));

  // ── Reports tab state ─────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState<'overview' | 'reports'>('overview');
  const [reportYear,    setReportYear]    = useState(new Date().getFullYear());
  const [reportTrips,   setReportTrips]   = useState<Trip[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    const load = async () => {
      setReportLoading(true);
      const { data } = await supabase
        .from('trips').select('*').is('deleted_at', null)
        .gte('date', `${reportYear}-01-01`).lte('date', `${reportYear}-12-31`);
      setReportTrips(data || []);
      setReportLoading(false);
    };
    load();
  }, [activeTab, reportYear]);

  const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280'];

  const reportMonthly = useMemo(() =>
    THAI_MONTHS_SHORT.map((month, i) => {
      const mo = reportTrips.filter(t => new Date(t.date).getMonth() === i);
      const revenue = mo.reduce((s, t) => s + (t.transport_price || 0), 0);
      const fuel    = mo.reduce((s, t) => s + (t.fuel_cost || 0), 0);
      const profit  = revenue - fuel - mo.reduce((s, t) => s + (t.trip_pay || 0) + (t.other_cost || 0), 0);
      return { month, 'รายได้': revenue, 'กำไร': profit };
    }),
  [reportTrips]);

  const reportKPI = useMemo(() => ({
    revenue: reportTrips.reduce((s, t) => s + (t.transport_price || 0), 0),
    profit:  reportTrips.reduce((s, t) => s + (t.transport_price || 0) - (t.fuel_cost || 0) - (t.trip_pay || 0) - (t.other_cost || 0), 0),
    trips:   reportTrips.length,
    dist:    reportTrips.reduce((s, t) => s + (t.distance || 0), 0),
  }), [reportTrips]);

  const reportPieData = useMemo(() => {
    const fuel  = reportTrips.reduce((s, t) => s + (t.fuel_cost || 0), 0);
    const pay   = reportTrips.reduce((s, t) => s + (t.trip_pay || 0), 0);
    const other = reportTrips.reduce((s, t) => s + (t.other_cost || 0), 0);
    return [
      { name: 'ค่าน้ำมัน', value: fuel },
      { name: 'ค่าเที่ยว', value: pay },
      { name: 'อื่นๆ', value: other },
    ].filter(d => d.value > 0);
  }, [reportTrips]);

  const reportDriverData = useMemo(() =>
    drivers.map(d => {
      const dTrips = reportTrips.filter(t => t.driver_id === d.id);
      return {
        name: d.nickname,
        'เที่ยว': dTrips.length,
        'รายได้': dTrips.reduce((s, t) => s + (t.transport_price || 0), 0),
        'ค่าน้ำมัน': dTrips.reduce((s, t) => s + (t.fuel_cost || 0), 0),
      };
    }),
  [reportTrips, drivers]);

  const monthLabel = getThaiMonthLabel(monthFilter);
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const now = new Date();
    return now.getFullYear() + BUDDHIST_ERA_OFFSET - i;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-blue-600" /> {COMPANY.name.split(' ')[0]}
            </h1>
            <p className="text-slate-500 text-sm">{COMPANY.name}</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              ภาพรวม
            </button>
            <button onClick={() => setActiveTab('reports')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'reports' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> รายงานประจำปี
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          {activeTab === 'overview' ? (<>
            <select className="form-input w-36 text-sm" value={monthFilter.month_index}
              onChange={e => setMonthFilter(f => ({ ...f, month_index: Number(e.target.value) }))}>
              {THAI_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select className="form-input w-24 text-sm" value={monthFilter.year_be}
              onChange={e => setMonthFilter(f => ({ ...f, year_be: Number(e.target.value) }))}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </>) : (
            <select className="form-input text-sm w-28" value={reportYear}
              onChange={e => setReportYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y + 543}</option>)}
            </select>
          )}
        </div>
      </div>

      {activeTab === 'overview' && <>

      {/* ── Quick Actions ── */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-white font-semibold text-sm">Quick Actions</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '+ สร้างงานใหม่',     icon: ClipboardList, color: 'bg-blue-500 hover:bg-blue-400',    href: '/jobs' },
            { label: '+ บันทึกเที่ยว',     icon: Truck,         color: 'bg-orange-500 hover:bg-orange-400', href: '/trips' },
            { label: 'อนุมัติเบิกเงิน',    icon: Banknote,      color: 'bg-purple-500 hover:bg-purple-400', href: '/advances' },
            { label: 'ตรวจน้ำมัน',        icon: Fuel,          color: 'bg-yellow-500 hover:bg-yellow-400', href: '/fuel' },
          ].map(({ label, icon: Icon, color, href }) => (
            <button key={label} onClick={() => router.push(href)}
              className={`${color} text-white rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium transition-colors`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </button>
          ))}
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
          { icon: TrendingUp,   label: 'รายรับรวม',  value: formatCurrency(companyStats.totalRevenue),  color: 'border-green-500 text-green-600 bg-green-50' },
          { icon: Fuel,         label: 'ค่าน้ำมันรวม',  value: formatCurrency(companyStats.totalFuel),     color: 'border-blue-500  text-blue-600  bg-blue-50'  },
          { icon: DollarSign,   label: 'รายจ่ายรวม', value: formatCurrency(companyStats.totalExpenses), color: 'border-red-500   text-red-600   bg-red-50'   },
          { icon: companyStats.netProfit >= 0 ? TrendingUp : AlertCircle,
            label: 'กำไรสุทธิ',
            value: formatCurrency(companyStats.netProfit),
            color: companyStats.netProfit >= 0 ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-red-500 text-red-600 bg-red-50' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className={`bg-white rounded-xl border-l-4 p-4 shadow-sm ${color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
              <Icon className="w-4 h-4 opacity-60" />
            </div>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs opacity-60 mt-0.5">{monthLabel}</p>
          </div>
        ))}
      </div>

      {/* Driver Stats Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            สรุปรายคนขับ — {monthLabel}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
                <th className="px-5 py-3 text-left">คนขับ</th>
                <th className="px-4 py-3 text-right">เที่ยว</th>
                <th className="px-4 py-3 text-right">รายรับ</th>
                <th className="px-4 py-3 text-right">ค่าเที่ยว</th>
                <th className="px-4 py-3 text-right">น้ำมัน</th>
                <th className="px-4 py-3 text-right">ระยะทาง</th>
                <th className="px-5 py-3 text-right">สิ้นเปลือง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {driverStats.map((d, i) => (
                <tr key={d.driver.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-5 py-3 font-semibold text-slate-700">{d.nickname}</td>
                  <td className="px-4 py-3 text-right">{d.trips}</td>
                  <td className="px-4 py-3 text-right text-green-700 font-medium">{formatCurrency(d.revenue)}</td>
                  <td className="px-4 py-3 text-right text-blue-700 font-medium">{formatCurrency(d.trip_pay)}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{formatCurrency(d.fuel_cost)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatNumber(d.distance)} กม.</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-semibold ${d.fuel_efficiency >= 3 ? 'text-green-600' : 'text-orange-500'}`}>
                      {d.fuel_efficiency > 0 ? `${d.fuel_efficiency} กม./ล.` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue/Expense bar */}
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
                  <div className="w-full rounded-t-lg transition-all duration-700"
                    style={{ height: `${Math.max(heightPct, 8)}%`, backgroundColor: CHART_COLORS.other }} />
                  <p className="mt-2 text-sm font-medium text-slate-600">{d.nickname}</p>
                  <p className="text-xs text-slate-400">{formatNumber(d.distance)} กม.</p>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">*ยิ่งสูงยิ่งประหยัดน้ำมัน</p>
        </div>

        {/* 6-month trend */}
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

      </>}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        reportLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'รายได้รวมทั้งปี',  value: formatCurrency(reportKPI.revenue),  icon: TrendingUp,  color: 'text-blue-600   bg-blue-50'   },
                { label: 'กำไรสุทธิ',         value: formatCurrency(reportKPI.profit),   icon: reportKPI.profit >= 0 ? TrendingUp : TrendingDown, color: reportKPI.profit >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
                { label: 'จำนวนเที่ยวรวม',    value: `${reportKPI.trips} เที่ยว`,  icon: Truck,       color: 'text-orange-600 bg-orange-50' },
                { label: 'ระยะทางรวม',        value: `${reportKPI.dist.toLocaleString('th-TH',{maximumFractionDigits:0})} กม.`, icon: Gauge, color: 'text-purple-600 bg-purple-50' },
              ].map(({ label, value, icon: Icon, color }) => {
                const [tc, bc] = color.split(' ');
                return (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className={`w-9 h-9 rounded-lg ${bc} flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${tc}`} />
                    </div>
                    <div className="text-lg font-bold text-slate-800">{value}</div>
                    <div className="text-sm text-slate-500 mt-1">{label}</div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-700 mb-4">
                รายได้และกำไรรายเดือน — {reportYear + 543}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={reportMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: 'Sarabun' }} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
                  <Bar dataKey="รายได้" fill="#3B82F6" radius={[4,4,0,0]} />
                  <Bar dataKey="กำไร"  fill="#10B981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 mb-4">สัดส่วนค่าใช้จ่าย</h3>
                {reportPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={reportPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {reportPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center text-slate-400">ไม่มีข้อมูล</div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 mb-4">เปรียบเทียบคนขับ</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reportDriverData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'Sarabun' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontFamily: 'Sarabun' }} width={50} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
                    <Bar dataKey="รายได้"   fill="#3B82F6" radius={[0,4,4,0]} />
                    <Bar dataKey="ค่าน้ำมัน" fill="#F59E0B" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
