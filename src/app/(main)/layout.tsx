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
      {/* Main content — จอเล็กเต็มความกว้าง (มีแถบบน 56px), lg ขึ้นไปเว้นที่ให้ sidebar ; ตอนพิมพ์เต็มความกว้าง */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 lg:ml-64 min-h-screen overflow-x-hidden print:ml-0 print:pt-0 print:w-full">
        {children}
      </main>
    </div>
  );
}
