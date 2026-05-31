import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — hidden when printing */}
      <aside className="print:hidden">
        <Sidebar userEmail={user.email} />
      </aside>
      {/* Main content — full width when printing */}
      <main className="flex-1 ml-64 min-h-screen overflow-x-hidden print:ml-0 print:w-full">
        {children}
      </main>
    </div>
  );
}
