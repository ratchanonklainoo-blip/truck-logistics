'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, RefreshCw, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';

interface Alert {
  id: string; type: string; severity: string; title: string; message: string;
  is_read: boolean; read_at: string | null; created_at: string;
  driver_id: string | null; job_id: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  fuel_anomaly:       { label: 'น้ำมันผิดปกติ',    icon: AlertTriangle },
  route_anomaly:      { label: 'เส้นทางผิดปกติ',   icon: AlertTriangle },
  low_profit:         { label: 'กำไรต่ำ',           icon: AlertCircle },
  overdue_customer:   { label: 'ลูกค้าค้างชำระ',  icon: AlertCircle },
  advance_over_limit: { label: 'เบิกเกินวงเงิน',  icon: AlertTriangle },
  system:             { label: 'ระบบ',              icon: Info },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  info:     { color: 'text-blue-700',  bg: 'bg-blue-50',   border: 'border-blue-200' },
  warning:  { color: 'text-yellow-700',bg: 'bg-yellow-50', border: 'border-yellow-200' },
  critical: { color: 'text-red-700',   bg: 'bg-red-50',    border: 'border-red-200' },
};

export default function AlertsPage() {
  const [supabase] = useState(() => createClient());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts').select('*').order('created_at', { ascending: false }).limit(100);
    setAlerts(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = showUnreadOnly ? alerts.filter(a => !a.is_read) : alerts;
  const unreadCount = alerts.filter(a => !a.is_read).length;

  const markRead = async (id: string) => {
    await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const unread = alerts.filter(a => !a.is_read);
      await Promise.all(unread.map(a => markRead(a.id)));
    } finally { setMarkingAll(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center relative">
            <Bell className="w-5 h-5 text-yellow-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">แจ้งเตือน</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'อ่านครบทุกรายการแล้ว'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showUnreadOnly}
              onChange={e => setShowUnreadOnly(e.target.checked)}
              className="w-4 h-4 rounded" />
            ยังไม่อ่านเท่านั้น
          </label>
          <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={markingAll} className="btn-primary text-sm">
              <CheckCircle className="w-4 h-4" /> อ่านทั้งหมด
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Bell className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          {showUnreadOnly ? 'ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน' : 'ไม่มีการแจ้งเตือน'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => {
            const tc = TYPE_CONFIG[alert.type] || TYPE_CONFIG['system'];
            const sc = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG['info'];
            const Icon = tc.icon;
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 flex gap-4 transition-all ${sc.bg} ${sc.border} ${!alert.is_read ? 'shadow-sm' : 'opacity-60'}`}
              >
                <div className={`flex-shrink-0 mt-0.5 ${sc.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white/60 ${sc.color}`}>
                      {tc.label}
                    </span>
                    {!alert.is_read && (
                      <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className={`font-semibold text-sm mb-0.5 ${sc.color}`}>{alert.title}</p>
                  <p className="text-sm text-slate-600">{alert.message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(alert.created_at).toLocaleString('th-TH', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                {!alert.is_read && (
                  <button
                    onClick={() => markRead(alert.id)}
                    className="flex-shrink-0 text-xs text-slate-500 hover:text-slate-800 underline self-start mt-1"
                  >
                    อ่านแล้ว
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
