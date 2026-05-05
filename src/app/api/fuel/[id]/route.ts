// ============================================================
// Fuel Event Detail + Actions
// GET    /api/fuel/[id]          — detail with OCR results
// POST   /api/fuel/[id]/verify   — Bank verifies
// POST   /api/fuel/[id]/pay      — Mother marks paid
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/client';
import { createClient as createServiceClient } from '@supabase/supabase-js';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('fuel_events')
    .select(`
      *,
      driver:drivers(id, name, nickname, license_plate, line_user_id),
      ocr_results(*)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();
  const { action, ...updates } = body;

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: dbUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 403 });

  // Load current fuel event
  const { data: fuelEvent } = await supabase
    .from('fuel_events')
    .select('*, driver:drivers(id, name, line_user_id)')
    .eq('id', id)
    .single();

  if (!fuelEvent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Action: verify (Bank) ─────────────────────────────────
  if (action === 'verify') {
    if (!['bank', 'admin'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Only Bank can verify' }, { status: 403 });
    }
    if (!['waiting_approval', 'needs_review'].includes(fuelEvent.status)) {
      return NextResponse.json({ error: `Cannot verify from status: ${fuelEvent.status}` }, { status: 409 });
    }

    const { error: updateErr } = await serviceClient
      .from('fuel_events')
      .update({
        status: 'waiting_payment',
        verified_by: dbUser.id,
        verified_at: new Date().toISOString(),
        // Allow manual correction of OCR data
        ...(updates.station_name !== undefined && { station_name: updates.station_name }),
        ...(updates.amount_baht !== undefined && { amount_baht: updates.amount_baht }),
        ...(updates.fuel_liters !== undefined && { fuel_liters: updates.fuel_liters }),
        ...(updates.price_per_liter !== undefined && { price_per_liter: updates.price_per_liter }),
        ...(updates.odometer !== undefined && { odometer: updates.odometer }),
        ...(updates.payment_method !== undefined && { payment_method: updates.payment_method }),
      })
      .eq('id', id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ data: { id, status: 'waiting_payment' } });
  }

  // ── Action: pay (Mother) ──────────────────────────────────
  if (action === 'pay') {
    if (!['mother', 'bank', 'admin'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Only Mother can mark as paid' }, { status: 403 });
    }
    if (fuelEvent.status !== 'waiting_payment') {
      return NextResponse.json({ error: `Cannot pay from status: ${fuelEvent.status}` }, { status: 409 });
    }

    const { error: updateErr } = await serviceClient
      .from('fuel_events')
      .update({
        status: 'paid',
        paid_by: dbUser.id,
        paid_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Notify driver via LINE
    const driver = fuelEvent.driver as { name: string; line_user_id: string | null };
    if (driver?.line_user_id && fuelEvent.amount_baht) {
      await pushMessage(driver.line_user_id, [{
        type: 'text',
        text: `✅ จ่ายค่าน้ำมัน ${fuelEvent.amount_baht.toLocaleString('th-TH')} บาท แล้วนะครับ`,
      }]);
    }

    return NextResponse.json({ data: { id, status: 'paid' } });
  }

  // ── Generic PATCH (manual update) ────────────────────────
  const allowedFields = [
    'station_name', 'amount_baht', 'fuel_liters', 'price_per_liter',
    'odometer', 'payment_method', 'notes', 'job_id', 'trip_id',
  ];
  const safeUpdates: Record<string, unknown> = {};
  for (const f of allowedFields) {
    if (updates[f] !== undefined) safeUpdates[f] = updates[f];
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('fuel_events')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
