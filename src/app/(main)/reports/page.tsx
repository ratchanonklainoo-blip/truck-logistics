'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Truck, Fuel } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const THAI_MONTHS_SHORT = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'];

interface TripRow {
  date: string; transport_price: number; trip_pay: number; fuel_cost: number;
  fuel_litres: number; other_cost: number; distance: number;
  driver_id: string; driver?: { id: string; nickname: string; name: string; } | null;
}

export default function ReportsPage() {
  const [supabase] = useState(() => createClient());
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [drivers, setDrivers] = useState<{id:string;name:string;nickname:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: dr }] = await Promise.all([
      supabase.from('trips').select('date,transport_price,trip_pay,fuel_cost,fuel_litres,other_cost,distance,driver_id')
        .is('deleted_at', null)
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
      supabase.from('drivers').select('id,name,nickname').is('deleted_at', null).eq('is_active', true),
    ]);
    const drList = dr || [];
    setDrivers(drList);
    const drMap: Record<string, {id:string;name:string;nickname:string}> = {};
    drList.forEach(d => { drMap[d.id] = d; });
    const enriched = (t || []).map(r => ({ ...r, driver: drMap[r.driver_id] || null }));
    setTrips(enriched as TripRow[]);
    setLoading(false);
  }, [supabase, year]);

  useEffect(() => { loadData(); }, [loadData]);

  // Monthly revenue/expense breakdown
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const rows = trips.filter(t => t.date.startsWith(`${year}-${m}`));
    const revenue = rows.reduce((s, t) => s + (t.transport_price || 0), 0);
    const fuelCost = rows.reduce((s, t) => s + (t.fuel_cost || 0), 0);
    const tripPay = rows.reduce((s, t) => s + (t.trip_pay || 0), 0);
    const other = rows.reduce((s, t) => s + (t.other_cost || 0), 0);
    const profit = revenue - fuelCost - tripPay - other;
    return {
      month: THAI_MONTHS_SHORT[i + 1],
      รายได้: Math.round(revenue),
      กำไร: Math.round(profit),
      ค่าน้ำมัน: Math.round(fuelCost),
      ค่ารอบ: Math.round(tripPay),
    };
  });

  // Driver comparison
  const driverData = drivers.map(d => {
    const rows = trips.filter(t => t.driver_id === d.id);
    const revenue = rows.reduce((s, t) => s + (t.transport_price || 0), 0);
    const fuelCost = rows.reduce((s, t) => s + (t.fuel_cost || 0), 0);
    const tripCount = rows.length;
    const totalDist = rows.reduce((s, t) => s + (t.distance || 0), 0);
    const totalFuelL = rows.reduce((s, t) => s + (t.fuel_litres || 0), 0);
    return {
      name: d.nickname || d.name,
      รายได้: Math.round(revenue),
      น้ำมัน: Math.round(fuelCost),
      เที่ยว: tripCount,
      กม: Math.round(totalDist),
      อัตราสิ้นเปลือง: totalFuelL > 0 ? Math.round((totalDist / totalFuelL) * 10) / 10 : 0,
    };
  }).filter(d => d.รายได้ > 0);

  // Summary stats
  const totalRevenue = trips.reduce((s, t) => s + (t.transport_price || 0), 0);
  const totalFuel = trips.reduce((s, t) => s + (t.fuel_cost || 0), 0);
  const totalTripPay = trips.reduce((s, t) => s + (t.trip_pay || 0), 0);
  const totalOther = trips.reduce((s, t) => s + (t.other_cost || 0), 0);
  const netProfit = totalRevenue - totalFuel - totalTripPay - totalOther;
  const totalTrips = trips.length;
  const totalDist = trips.reduce((s, t) => s + (t.distance || 0), 0);

  // Expense breakdown for pie chart
  const pieData = [
    { name: 'ค่าน้ำมัน', value: Math.round(totalFuel) },
    { name: 'ค่ารอบ', value: Math.round(totalTripPay) },
    { name: 'อื่นๆ', value: Math.round(totalOther) },
  ].filter(d => d.value > 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">รายงาน</h1>
            <p className="text-sm text-slate-500">ภาพรวมธุรกิจประจำปี</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <select className="form-input text-sm w-28"
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'รายได้รวม', value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'กำไรสุทธิ', value: formatCurrency(netProfit), icon: netProfit >= 0 ? TrendingUp : TrendingDown, color: netProfit >= 0 ? 'text-green-600' : 'text-red-600', bg: netProfit >= 0 ? 'bg-green-50' : 'bg-red-50' },
          { label: 'จำนวนเที่ยว', value: `${totalTrips} เที่ยว`, icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'ระยะทางรวม', value: `${totalDist.toLocaleString('th-TH', { maximumFractionDigits: 0 })} กม.`, icon: Fuel, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-lg font-bold text-slate-800">{value}</div>
            <div className="text-sm text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Monthly Revenue + Profit Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-4">รายได้และกำไรรายเดือน</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: 'Sarabun' }} />
            <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
            <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
            <Bar dataKey="รายได้" fill="#3B82F6" radius={[4,4,0,0]} />
            <Bar dataKey="กำไร" fill="#10B981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Expense Breakdown Pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">สัดส่วนค่าใช้จ่าย</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400 text-sm mt-8">ไม่มีข้อมูล</p>
          )}
        </div>

        {/* Driver Comparison */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">เปรียบเทียบคนขับ</h2>
          {driverData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={driverData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Sarabun' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip formatter={(v: number, name: string) =>
                  name === 'อัตราสิ้นเปลือง' ? [`${v} กม./ล.`, name] : [formatCurrency(v), name]}
                  contentStyle={{ fontFamily: 'Sarabun', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 12 }} />
                <Bar dataKey="รายได้" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="น้ำมัน" fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400 text-sm mt-8">ไม่มีข้อมูล</p>
          )}
        </div>
      </div>

      {/* Fuel Efficiency Line Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-4">ค่าน้ำมันรายเดือน</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: 'Sarabun' }} />
            <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
            <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 13 }} />
            <Line type="monotone" dataKey="ค่าน้ำมัน" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="ค่ารอบ" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
