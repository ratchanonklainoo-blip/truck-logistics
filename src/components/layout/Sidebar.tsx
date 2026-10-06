'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COMPANY } from '@/lib/constants';
import { isHiddenRoute } from '@/lib/hiddenFeatures';
import {
  Truck, LayoutDashboard, ClipboardList,
  Users, Fuel, MapPin, UserCheck,
  Bell, Settings, LogOut, Navigation,
  Wallet, ChevronRight, Ship, FileText, BarChart3, Printer, Menu, X, TrendingUp,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface Badges {
  advances: number;
  fuel:     number;
  alerts:   number;
  jobs:     number;
}

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'ศูนย์ควบคุม',       icon: LayoutDashboard, badge: null },
  { href: '/jobs',       label: 'งานเข้า',             icon: ClipboardList,   badge: 'jobs'     as keyof Badges },
  { href: '/jobs-nearby', label: 'งานใกล้รถ',          icon: Navigation,      badge: null },
  { href: '/trips',      label: 'เที่ยววิ่ง',         icon: MapPin,          badge: null },
  { href: '/fuel',       label: 'เติมน้ำมัน',         icon: Fuel,            badge: 'fuel'     as keyof Badges },
  { href: '/advances',   label: 'เบิกเงิน',            icon: Wallet,          badge: 'advances' as keyof Badges },
  { href: '/customers',  label: 'ลูกค้า',              icon: Users,           badge: null },
  { href: '/drivers',    label: 'คนขับ',               icon: UserCheck,       badge: null },
  { href: '/payroll',    label: 'เงินเดือนและค่ารอบ', icon: Wallet,          badge: null },
  { href: '/payslip',    label: 'พิมพ์สลิป',           icon: Printer,         badge: null },
  { href: '/import',     label: 'ชิปปิ้ง',            icon: Ship,            badge: null },
  { href: '/documents',  label: 'เอกสาร',              icon: FileText,        badge: null },
  { href: '/reports',    label: 'รายงานรายเดือน',     icon: BarChart3,        badge: null },
  { href: '/reports/trip-profit', label: 'กำไรรายเที่ยว', icon: TrendingUp,     badge: null },
  { href: '/alerts',     label: 'แจ้งเตือน',           icon: Bell,            badge: 'alerts'   as keyof Badges },
  { href: '/settings',   label: 'ตั้งค่าระบบ',         icon: Settings,        badge: null },
] as const;

const PHASE_AVAILABLE = new Set([
  '/dashboard', '/trips', '/jobs', '/jobs-nearby', '/customers', '/drivers', '/settings',
  '/fuel', '/advances', '/payroll', '/payslip', '/alerts', '/import', '/documents', '/reports', '/reports/trip-profit',
]);

interface SidebarProps { userEmail?: string; }

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [supabase] = useState(() => createClient());
  const [loggingOut, setLoggingOut] = useState(false);
  const [badges, setBadges] = useState<Badges>({ advances: 0, fuel: 0, alerts: 0, jobs: 0 });
  // มือถือ/แท็บเล็ต (< lg): sidebar เป็น drawer เปิดด้วยปุ่ม hamburger ; จอใหญ่แสดงตลอดเหมือนเดิม
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const loadBadges = async () => {
    const [advRes, fuelRes, alertRes, jobRes] = await Promise.all([
      isHiddenRoute('/advances') ? Promise.resolve({ count: 0 }) : supabase.from('advance_requests').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').is('deleted_at', null),
      isHiddenRoute('/fuel') ? Promise.resolve({ count: 0 }) : supabase.from('fuel_events').select('id', { count: 'exact', head: true })
        .in('status', ['waiting_approval', 'needs_review']).is('deleted_at', null),
      supabase.from('alerts').select('id', { count: 'exact', head: true })
        .eq('is_read', false),
      supabase.from('jobs').select('id', { count: 'exact', head: true })
        .not('status', 'eq', 'closed').is('deleted_at', null),
    ]);
    setBadges({
      advances: advRes.count  || 0,
      fuel:     fuelRes.count || 0,
      alerts:   alertRes.count || 0,
      jobs:     jobRes.count  || 0,
    });
  };

  useEffect(() => {
    loadBadges();
    const channel = supabase.channel('sidebar-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'advance_requests' }, loadBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_events' }, loadBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, loadBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadBadges)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
    {/* แถบบนสำหรับจอเล็ก */}
    <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center gap-2 px-2 shadow-md"
         style={{ backgroundColor: '#1E3A5F' }}>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู"
              aria-expanded={mobileOpen}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-white hover:bg-white/10">
        <Menu className="w-6 h-6" />
      </button>
      <p className="text-white font-semibold text-sm truncate">{COMPANY.name}</p>
    </div>
    {mobileOpen && (
      <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
    )}
    <aside className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] flex flex-col transition-transform duration-200
                       lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
           style={{ backgroundColor: '#1E3A5F' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex-shrink-0 w-9 h-9 bg-yellow-400 rounded-lg flex items-center justify-center">
          <Truck className="w-5 h-5" style={{ color: '#1E3A5F' }} />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">{COMPANY.name}</p>
          <p className="text-slate-400 text-xs">Logistics OS v2.0</p>
        </div>
        <button type="button" onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู"
                className="lg:hidden ml-auto w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.filter(i => !isHiddenRoute(i.href)).map(({ href, label, icon: Icon, badge }) => {
          // เมนูย่อย (เช่น /reports/trip-profit) ไม่ให้เมนูแม่ /reports ติดสถานะ active ไปด้วย
          const isActive   = (pathname === href || pathname.startsWith(href + '/'))
            && !NAV_ITEMS.some(o => o.href.length > href.length && o.href.startsWith(href + '/') && (pathname === o.href || pathname.startsWith(o.href + '/')));
          const available  = PHASE_AVAILABLE.has(href);
          const badgeCount = badge ? badges[badge] : 0;

          return (
            <Link
              key={href}
              href={available ? href : '#'}
              className={`sidebar-link min-h-[44px] lg:min-h-0 ${isActive ? 'active' : ''} ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={e => { if (!available) e.preventDefault(); }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {isActive && !badgeCount && <ChevronRight className="w-3 h-3" />}
              {!available && (
                <span className="text-[9px] bg-white/20 rounded px-1 py-0.5 font-medium">เร็วๆ นี้</span>
              )}
              {available && badgeCount > 0 && (
                <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/10 px-3 py-4 space-y-1">
        {userEmail && (
          <div className="px-4 py-2 text-xs text-slate-400 truncate">{userEmail}</div>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="sidebar-link min-h-[44px] lg:min-h-0 w-full text-left text-red-300 hover:bg-red-500/20 hover:text-red-200"
        >
          <LogOut className="w-4 h-4" /><span>{loggingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
        </button>
      </div>
    </aside>
    </>
  );
}
