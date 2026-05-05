// Auto Alert Engine — POST /api/alerts/check
// Call this on a schedule or after key events
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function createAlert(supabase: ReturnType<typeof getServiceClient>, alert: {
  type: string; severity: string; title: string; message: string;
  driver_id?: string; job_id?: string; fuel_event_id?: string; customer_id?: string;
  metadata?: Record<string, unknown>;
}) {
  // Check if similar unread alert exists (avoid duplicates)
  const { data: existing } = await supabase.from('alerts')
    .select('id').eq('type', alert.type).eq('is_read', false)
    .eq('title', alert.title).limit(1).single();
  if (existing) return; // skip duplicate
  await supabase.from('alerts').insert(alert);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const internalKey = req.headers.get('x-internal-key');
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const generated: string[] = [];

  // ── 1. Overdue customer payments ──────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const { data: overdueJobs } = await supabase.from('jobs')
    .select('id, customer_id, selling_price, payment_due_date, origin, destination')
    .eq('status', 'waiting_payment')
    .not('payment_due_date', 'is', null)
    .lt('payment_due_date', today)
    .is('deleted_at', null);

  for (const job of overdueJobs || []) {
    await createAlert(supabase, {
      type: 'overdue_customer', severity: 'critical',
      title: `ลูกค้าค้างชำระเกินกำหนด`,
      message: `งาน ${job.origin} → ${job.destination} ครบกำหนด ${job.payment_due_date} ยังไม่ได้รับเงิน ${job.selling_price?.toLocaleString('th-TH')} บาท`,
      job_id: job.id, customer_id: job.customer_id,
      metadata: { selling_price: job.selling_price, due_date: job.payment_due_date },
    });
    generated.push('overdue_customer');
  }

  // ── 2. Fuel anomaly (amount > 20% above driver average) ───
  const { data: recentFuel } = await supabase.from('fuel_events')
    .select('id, driver_id, amount_baht, station_name')
    .eq('status', 'waiting_approval')
    .eq('is_anomaly', true)
    .is('deleted_at', null);

  for (const fe of recentFuel || []) {
    await createAlert(supabase, {
      type: 'fuel_anomaly', severity: 'warning',
      title: `น้ำมันผิดปกติ`,
      message: `ยอดเติมน้ำมัน ${fe.amount_baht?.toLocaleString('th-TH')} บาท สูงกว่าค่าเฉลี่ยมากกว่า 20%${fe.station_name ? ` (${fe.station_name})` : ''}`,
      driver_id: fe.driver_id, fuel_event_id: fe.id,
      metadata: { amount_baht: fe.amount_baht },
    });
    generated.push('fuel_anomaly');
  }

  // ── 3. Advance over monthly limit ─────────────────────────
  const monthYear = today.slice(0, 7);
  const { data: pendingAdv } = await supabase.from('advance_requests')
    .select('id, driver_id, amount')
    .eq('status', 'pending').eq('month_year', monthYear)
    .is('deleted_at', null);

  for (const adv of pendingAdv || []) {
    const { data: driver } = await supabase.from('drivers')
      .select('monthly_advance_limit, nickname, name').eq('id', adv.driver_id).single();
    if (!driver) continue;

    const { data: monthUsed } = await supabase.from('advance_requests')
      .select('amount').eq('driver_id', adv.driver_id).eq('month_year', monthYear)
      .in('status', ['approved', 'paid']).is('deleted_at', null);

    const used = (monthUsed || []).reduce((s, a) => s + a.amount, 0);
    const limit = driver.monthly_advance_limit || 5000;

    if (used + adv.amount > limit) {
      await createAlert(supabase, {
        type: 'advance_over_limit', severity: 'warning',
        title: `คำขอเบิกเกินวงเงิน`,
        message: `${driver.nickname || driver.name} ขอเบิก ${adv.amount.toLocaleString('th-TH')} บาท (ใช้ไปแล้ว ${used.toLocaleString('th-TH')} / ${limit.toLocaleString('th-TH')} บาท)`,
        driver_id: adv.driver_id,
        metadata: { amount: adv.amount, used, limit },
      });
      generated.push('advance_over_limit');
    }
  }

  return NextResponse.json({ data: { generated, count: generated.length } });
}
