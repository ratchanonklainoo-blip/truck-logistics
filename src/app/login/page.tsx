'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Truck, Lock, Mail, AlertCircle } from 'lucide-react';
import { COMPANY } from '@/lib/constants';

export default function LoginPage() {
  const router  = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-400 rounded-2xl shadow-lg mb-4">
            <Truck className="w-9 h-9 text-navy-800" />
          </div>
          <h1 className="text-2xl font-bold text-white">{COMPANY.name}</h1>
          <p className="text-slate-400 text-sm mt-1">ระบบจัดการรถพ่วง v2.0</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">เข้าสู่ระบบ</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="form-label">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="your@email.com"
                  className="form-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="form-label">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="form-input pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-navy-700 hover:bg-navy-800 text-white font-semibold py-3 px-4 rounded-lg
                         shadow-md transition-colors flex items-center justify-center gap-2
                         disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          {COMPANY.address}
        </p>
      </div>
    </div>
  );
}
