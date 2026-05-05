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
      <Sidebar userEmail={user.email} />
      {/* Main content — offset by sidebar width */}
      <main className="flex-1 ml-64 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
