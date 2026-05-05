// POST /api/line/daily-summary
// Called by Vercel Cron nightly — sends summary to manager LINE

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pushMessage } from '@/lib/line/client';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Allow internal calls only
  const internalKey = req.headers.get('x-internal-key') || req.headers.get('authorization');
  const validKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (validKey && internalKey !== validKey && internalKey !== `Bearer ${validKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // Load settings
  const { data: settings } = await supabase.from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['daily_summary_enabled', 'manager_line_user_id', 'daily_summary_line_id']);

  const settingsMap: Record<string, unknown> = {};
  (settings || []).forEach(s => { settingsMap[s.setting_key] = s.setting_value; });

  const enabled = settingsMap['daily_summary_enabled'] === true || settingsMap['daily_summary_enabled'] === 'true';
  if (!enabled) return NextResponse.json({ skipped: true, reason: 'disabled' });

  const lineId = (settingsMap['daily_summary_line_id'] as string)
    || (settingsMap['manager_line_user_id'] as string);
  if (!lineId) return NextResponse.json({ skipped: true, reason: 'no_line_id' });

  // Gather today's stats
  const [{ data: todayJobs }, { data: allJobs }, { data: fuelPending }, { data: advPending }] = await Promise.all([
    supabase.from('jobs').select('id,status,selling_price').is('deleted_at', null).eq('date', today),
    supabase.from('jobs').select('id,status,selling_price,payment_due_date').is('deleted_at', null)
      .neq('status', 'closed'),
    supabase.from('fuel_events').select('id').is('deleted_at', null)
      .in('status', ['waiting_approval', 'needs_review']),
    supabase.from('advance_requests').select('id,amount').is('deleted_at', null).eq('status', 'pending'),
  ]);

  const inProgress = (allJobs || []).filter(j => j.status === 'in_progress').length;
  const waitingPayment = (allJobs || []).filter(j => j.status === 'waiting_payment').length;
  const overdue = (allJobs || []).filter(j =>
    j.status === 'waiting_payment' && j.payment_due_date && j.payment_due_date < today
  ).length;

  const todayRevenue = (todayJobs || [])
    .filter(j => j.status === 'closed')
    .reduce((s: number, j: { selling_price: number }) => s + (j.selling_price || 0), 0);

  const advTotal = (advPending || []).reduce((s: number, a: { amount: number }) => s + (a.amount || 0), 0);

  const thaiDate = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  const lines: string[] = [
    `📊 สรุปประจำวัน`,
    `${thaiDate}`,
    ``,
    `🚛 งานวันนี้: ${(todayJobs || []).length} งาน`,
    `   · กำลังวิ่ง ${inProgress} คัน`,
    `   · รอรับเงิน ${waitingPayment} งาน`,
    `💰 รายได้วันนี้: ฿${todayRevenue.toLocaleString('th-TH')}`,
  ];

  if ((fuelPending || []).length > 0) {
    lines.push(`⛽ รอตรวจน้ำมัน: ${fuelPending!.length} รายการ`);
  }
  if ((advPending || []).length > 0) {
    lines.push(`💸 รอเบิกเงิน: ${advPending!.length} ราย (฿${advTotal.toLocaleString('th-TH')})`);
  }
  if (overdue > 0) {
    lines.push(`⚠️ ลูกค้าเกินกำหนดชำระ: ${overdue} ราย`);
  }

  lines.push(``, `📱 truck-logistics-me62.vercel.app`);

  await pushMessage(lineId, [{ type: 'text', text: lines.join('\n') }]);

  return NextResponse.json({ sent: true, to: lineId, lines: lines.length });
}
