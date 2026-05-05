'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COMPANY } from '@/lib/constants';
import {
  Truck, LayoutDashboard, ClipboardList, Search,
  Users, Fuel, MapPin, Receipt, UserCheck,
  BarChart3, Bell, Settings, LogOut,
  Wallet, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'ศูนย์ควบคุม',       icon: LayoutDashboard },
  { href: '/trips',      label: 'เที่ยววิ่ง',         icon: MapPin },
  { href: '/jobs',       label: 'งานเข้า',             icon: ClipboardList },
  { href: '/fuel',       label: 'เติมน้ำมัน',         icon: Fuel },
  { href: '/expenses',   label: 'ค่าใช้จ่าย',         icon: Receipt },
  { href: '/customers',  label: 'ลูกค้า',              icon: Users },
  { href: '/drivers',    label: 'คนขับ',               icon: UserCheck },
  { href: '/payroll',    label: 'เงินเดือนและค่ารอบ', icon: Wallet },
  { href: '/reports',    label: 'รายงาน',              icon: BarChart3 },
  { href: '/alerts',     label: 'แจ้งเตือน',           icon: Bell },
  { href: '/settings',   label: 'ตั้งค่าระบบ',         icon: Settings },
] as const;

// Phase badge — shows which features are available
const PHASE_AVAILABLE = new Set([
  '/dashboard', '/trips', '/customers', '/drivers', '/payslip', '/settings',
]);

interface SidebarProps {
  userEmail?: string;
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="fixed inset-y-0 left-0 w-64 flex flex-col"
           style={{ backgroundColor: '#1E3A5F' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex-shrink-0 w-9 h-9 bg-yellow-400 rounded-lg flex items-center justify-center">
          <Truck className="w-5 h-5 text-navy-800" style={{ color: '#1E3A5F' }} />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">
            {COMPANY.name}
          </p>
          <p className="text-slate-400 text-xs">Logistics OS v2.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive  = pathname === href || pathname.startsWith(href + '/');
          const available = PHASE_AVAILABLE.has(href);

          return (
            <Link
              key={href}
              href={available ? href : '#'}
              className={`sidebar-link ${isActive ? 'active' : ''} ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={e => { if (!available) e.preventDefault(); }}
              title={!available ? 'Phase 2 - เร็วๆ นี้' : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {isActive && <ChevronRight className="w-3 h-3" />}
              {!available && (
                <span className="text-[9px] bg-white/20 rounded px-1 py-0.5 font-medium">
                  P2
                </span>
              )}
            </Link>
          );
        })}

        {/* Payslip (special entry not in main flow) */}
        <Link
          href="/payslip"
          className={`sidebar-link ${pathname === '/payslip' ? 'active' : ''}`}
        >
          <Receipt className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 truncate">ใบจ่ายเงิน</span>
          {pathname === '/payslip' && <ChevronRight className="w-3 h-3" />}
        </Link>
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/10 px-3 py-4 space-y-1">
        {userEmail && (
          <div className="px-4 py-2 text-xs text-slate-400 truncate">
            {userEmail}
          </div>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="sidebar-link w-full text-left text-red-300 hover:bg-red-500/20 hover:text-red-200"
        >
          <LogOut className="w-4 h-4" />
          <span>{loggingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
        </button>
      </div>
    </aside>
  );
}
