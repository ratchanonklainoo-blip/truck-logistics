// ============================================================
// POST /api/fuel/quick — Quick fuel entry with auto photo-read
// Lets office staff upload photo(s) directly in the web app
// (no LINE round-trip) and get OCR-filled fields back immediately.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { runOcrOnImage, mergeOcrResults, detectFuelAnomaly } from '@/lib/ocr/fuel';

export const dynamic = 'force-dynamic';
const OCR_CONFIDENCE_THRESHOLD = 0.85;

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { driver_id, trip_id, fuel_date, photo_pump_url, photo_payment_url, photo_odometer_url } = body;

  if (!driver_id) {
    return NextResponse.json({ error: 'driver_id required' }, { status: 400 });
  }
  if (!fuel_date) {
    return NextResponse.json({ error: 'fuel_date required' }, { status: 400 });
  }
  if (!photo_pump_url && !photo_payment_url && !photo_odometer_url) {
    return NextResponse.json({ error: 'ต้องแนบรูปอย่างน้อย 1 รูป' }, { status: 400 });
  }

  const serviceClient = getServiceClient();

  const { data: fuelEvent, error: insertErr } = await serviceClient
    .from('fuel_events')
    .insert({
      driver_id,
      trip_id: trip_id || null,
      fuel_date,
      status: 'waiting_ocr',
      photo_pump_url: photo_pump_url || null,
      photo_payment_url: photo_payment_url || null,
      photo_odometer_url: photo_odometer_url || null,
    })
    .select()
    .single();

  if (insertErr || !fuelEvent) {
    return NextResponse.json({ error: insertErr?.message || 'สร้างรายการไม่สำเร็จ' }, { status: 500 });
  }

  try {
    const ocrTasks: Promise<Awaited<ReturnType<typeof runOcrOnImage>>>[] = [];
    if (photo_pump_url)     ocrTasks.push(runOcrOnImage(photo_pump_url, 'pump'));
    if (photo_payment_url)  ocrTasks.push(runOcrOnImage(photo_payment_url, 'payment'));
    if (photo_odometer_url) ocrTasks.push(runOcrOnImage(photo_odometer_url, 'odometer'));

    const results = await Promise.all(ocrTasks);

    for (const r of results) {
      await serviceClient.from('ocr_results').insert({
        fuel_event_id: fuelEvent.id,
        image_url: r.image_url,
        image_type: r.image_type,
        raw_response: r.raw_response,
        extracted_data: r.extracted,
        confidence: r.confidence,
        model_used: 'gpt-4o',
        tokens_used: r.tokens_used,
      });
    }

    const { merged, overallConfidence } = mergeOcrResults(results);

    let isAnomaly = false;
    let anomalyReason: string | null = null;

    if (merged.amount_baht) {
      const { data: recentFuel } = await serviceClient
        .from('fuel_events').select('amount_baht')
        .eq('driver_id', driver_id).eq('status', 'paid')
        .not('amount_baht', 'is', null).order('created_at', { ascending: false }).limit(10);

      if (recentFuel && recentFuel.length >= 3) {
        const avg = recentFuel.reduce((s: number, f: { amount_baht: number }) => s + (f.amount_baht || 0), 0) / recentFuel.length;
        const anomaly = detectFuelAnomaly(merged.amount_baht, avg);
        isAnomaly = anomaly.isAnomaly;
        anomalyReason = anomaly.reason;
      }
    }

    const newStatus = overallConfidence >= OCR_CONFIDENCE_THRESHOLD ? 'waiting_approval' : 'needs_review';

    const { data: updated, error: updateErr } = await serviceClient
      .from('fuel_events')
      .update({
        status: newStatus,
        station_name: merged.station_name,
        amount_baht: merged.amount_baht,
        fuel_liters: merged.fuel_liters,
        price_per_liter: merged.price_per_liter,
        odometer: merged.odometer,
        payment_method: merged.payment_method,
        ocr_confidence: overallConfidence,
        is_anomaly: isAnomaly,
        anomaly_reason: anomalyReason,
      })
      .eq('id', fuelEvent.id)
      .select('*, driver:drivers(id, name, nickname, license_plate)')
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ data: updated });

  } catch (err) {
    console.error('[Fuel Quick] OCR pipeline error:', err);
    const { data: fallback } = await serviceClient
      .from('fuel_events')
      .update({ status: 'needs_review' })
      .eq('id', fuelEvent.id)
      .select('*, driver:drivers(id, name, nickname, license_plate)')
      .single();

    // OCR failed — event still created, staff fills fields in manually via VerifyModal.
    return NextResponse.json({ data: fallback, ocrFailed: true });
  }
}
