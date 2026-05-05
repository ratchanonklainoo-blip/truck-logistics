// Fuel OCR Pipeline — POST /api/fuel/ocr

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runOcrOnImage, mergeOcrResults, detectFuelAnomaly } from '@/lib/ocr/fuel';
import { pushMessage, REPLIES } from '@/lib/line/client';

export const dynamic = 'force-dynamic';
const OCR_CONFIDENCE_THRESHOLD = 0.85;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const internalKey = req.headers.get('x-internal-key');
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fuel_event_id } = await req.json();
  if (!fuel_event_id) {
    return NextResponse.json({ error: 'fuel_event_id required' }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: fuelEvent, error } = await supabase
    .from('fuel_events')
    .select('*, driver:drivers(id, name, line_user_id)')
    .eq('id', fuel_event_id)
    .single();

  if (error || !fuelEvent) {
    return NextResponse.json({ error: 'Fuel event not found' }, { status: 404 });
  }

  if (fuelEvent.status !== 'waiting_ocr') {
    return NextResponse.json({ error: `Invalid status: ${fuelEvent.status}` }, { status: 409 });
  }

  try {
    const ocrTasks: Promise<Awaited<ReturnType<typeof runOcrOnImage>>>[] = [];
    if (fuelEvent.photo_pump_url)    ocrTasks.push(runOcrOnImage(fuelEvent.photo_pump_url, 'pump'));
    if (fuelEvent.photo_payment_url) ocrTasks.push(runOcrOnImage(fuelEvent.photo_payment_url, 'payment'));
    if (fuelEvent.photo_odometer_url) ocrTasks.push(runOcrOnImage(fuelEvent.photo_odometer_url, 'odometer'));

    const results = await Promise.all(ocrTasks);

    for (const r of results) {
      await supabase.from('ocr_results').insert({
        fuel_event_id,
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
      const { data: recentFuel } = await supabase
        .from('fuel_events').select('amount_baht')
        .eq('driver_id', fuelEvent.driver_id).eq('status', 'paid')
        .not('amount_baht', 'is', null).order('created_at', { ascending: false }).limit(10);

      if (recentFuel && recentFuel.length >= 3) {
        const avg = recentFuel.reduce((s: number, f: { amount_baht: number }) => s + (f.amount_baht || 0), 0) / recentFuel.length;
        const anomaly = detectFuelAnomaly(merged.amount_baht, avg);
        isAnomaly = anomaly.isAnomaly;
        anomalyReason = anomaly.reason;
      }
    }

    const newStatus = overallConfidence >= OCR_CONFIDENCE_THRESHOLD ? 'waiting_approval' : 'needs_review';

    await supabase.from('fuel_events').update({
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
    }).eq('id', fuel_event_id);

    const driver = fuelEvent.driver as { id: string; name: string; line_user_id: string | null };
    if (driver?.line_user_id) {
      if (newStatus === 'waiting_approval' && merged.station_name && merged.fuel_liters && merged.amount_baht) {
        await pushMessage(driver.line_user_id, [REPLIES.ocrSuccess(merged.station_name, merged.fuel_liters, merged.amount_baht)]);
      } else {
        await pushMessage(driver.line_user_id, [REPLIES.ocrNeedsReview()]);
      }
    }

    const { data: bankUser } = await supabase.from('users').select('line_user_id')
      .eq('role', 'bank').eq('is_active', true).not('line_user_id', 'is', null).limit(1).single();
    if (bankUser?.line_user_id) {
      const anomalyTag = isAnomaly ? ' ⚠️ ผิดปกติ' : '';
      await pushMessage(bankUser.line_user_id, [{
        type: 'text',
        text: `⛽ น้ำมันใหม่ รอตรวจสอบ${anomalyTag}\nคนขับ: ${driver.name}` +
              (merged.amount_baht ? `\nยอด: ${merged.amount_baht.toLocaleString('th-TH')} บาท` : '') +
              (newStatus === 'needs_review' ? '\n📋 ต้องตรวจสอบด้วยตนเอง' : ''),
      }]);
    }

    return NextResponse.json({ data: { fuel_event_id, status: newStatus, confidence: overallConfidence, merged } });

  } catch (err) {
    console.error('[OCR] Pipeline error:', err);
    await supabase.from('fuel_events').update({ status: 'needs_review' }).eq('id', fuel_event_id);
    return NextResponse.json({ error: 'OCR pipeline failed' }, { status: 500 });
  }
}
