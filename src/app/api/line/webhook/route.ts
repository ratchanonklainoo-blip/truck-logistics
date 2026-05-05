// ============================================================
// LINE Webhook Handler
// POST /api/line/webhook
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  verifyLineSignature,
  detectTextIntent,
  parseAdvanceRequest,
  parseOdometerReading,
} from '@/lib/line/webhook';
import {
  replyMessage,
  pushMessage,
  downloadLineImage,
  REPLIES,
} from '@/lib/line/client';

// Use service role to bypass RLS (webhook runs server-side, no user session)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Photo grouping window: 30 minutes
const FUEL_GROUP_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature') || '';

  // 2. Verify signature
  if (!verifyLineSignature(rawBody, signature)) {
    console.warn('[LINE Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Process each event
  for (const event of payload.events) {
    try {
      await processEvent(event);
    } catch (err) {
      console.error('[LINE Webhook] Error processing event:', err);
    }
  }

  // LINE requires 200 OK even if processing fails
  return NextResponse.json({ ok: true });
}

// ── Event Processor ───────────────────────────────────────────

async function processEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message') return;
  const { message, source, replyToken } = event;
  const lineUserId = source.userId;

  // Look up driver by line_user_id
  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  // Save raw message to line_messages
  const { data: savedMsg } = await supabase
    .from('line_messages')
    .insert({
      line_user_id: lineUserId,
      driver_id: driver?.id || null,
      message_type: message.type,
      content: message.type === 'text' ? message.text : null,
      image_url: null, // will be filled after download
      intent: null,
      processed: false,
      raw_payload: event as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  // ── Image message → fuel photo ────────────────────────────
  if (message.type === 'image') {
    if (!driver) {
      await replyMessage(replyToken, [{
        type: 'text',
        text: 'ขออภัยครับ ไม่พบข้อมูลคนขับ กรุณาติดต่อทีมงาน',
      }]);
      return;
    }

    // Download image and upload to Supabase Storage
    const imageBuffer = await downloadLineImage(message.id);
    const fileName = `fuel/${driver.id}/${Date.now()}_${message.id}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('line-images')
      .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      console.error('[LINE] Upload failed:', uploadError);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('line-images')
      .getPublicUrl(fileName);

    // Update line_message with image URL + intent
    await supabase
      .from('line_messages')
      .update({ image_url: publicUrl, intent: 'fuel_photo', processed: true })
      .eq('id', savedMsg?.id);

    // ── Group photos into fuel_event ──
    const photoCount = await groupFuelPhoto(driver.id, publicUrl, message.id, replyToken);
    return;
  }

  // ── Text message → detect intent ─────────────────────────
  if (message.type === 'text') {
    const intent = detectTextIntent(message.text);

    await supabase
      .from('line_messages')
      .update({ intent, processed: intent !== 'unknown' })
      .eq('id', savedMsg?.id);

    if (intent === 'advance_request') {
      if (!driver) {
        await replyMessage(replyToken, [{ type: 'text', text: 'ขออภัยครับ ไม่พบข้อมูลคนขับ' }]);
        return;
      }
      await handleAdvanceRequest(driver, message.text, replyToken, savedMsg?.id);
      return;
    }

    if (intent === 'odometer') {
      const km = parseOdometerReading(message.text);
      await replyMessage(replyToken, [{
        type: 'text',
        text: km ? `รับทราบ เลขไมล์ ${km.toLocaleString('th-TH')} กม. ✅` : 'รับข้อความแล้วครับ',
      }]);
      return;
    }

    // Unknown — fallback reply
    await replyMessage(replyToken, [REPLIES.unknownMessage()]);
  }
}

// ── Fuel Photo Grouping ───────────────────────────────────────

async function groupFuelPhoto(
  driverId: string,
  imageUrl: string,
  messageId: string,
  replyToken: string
): Promise<void> {
  const windowStart = new Date(Date.now() - FUEL_GROUP_WINDOW_MS).toISOString();

  // Find pending fuel_event within 30-minute window for this driver
  const { data: existing } = await supabase
    .from('fuel_events')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'waiting_data')
    .gte('created_at', windowStart)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!existing) {
    // First photo — create new fuel_event
    await supabase.from('fuel_events').insert({
      driver_id: driverId,
      status: 'waiting_data',
      photo_pump_url: imageUrl,
    });
    await replyMessage(replyToken, [REPLIES.fuelPhoto1()]);
    return;
  }

  // Determine which slot to fill
  if (!existing.photo_pump_url) {
    await supabase.from('fuel_events').update({ photo_pump_url: imageUrl }).eq('id', existing.id);
    await replyMessage(replyToken, [REPLIES.fuelPhoto1()]);
    return;
  }

  if (!existing.photo_payment_url) {
    await supabase.from('fuel_events').update({ photo_payment_url: imageUrl }).eq('id', existing.id);
    await replyMessage(replyToken, [REPLIES.fuelPhoto2()]);
    return;
  }

  if (!existing.photo_odometer_url) {
    // All 3 photos received — trigger OCR
    await supabase.from('fuel_events').update({
      photo_odometer_url: imageUrl,
      status: 'waiting_ocr',
    }).eq('id', existing.id);

    await replyMessage(replyToken, [REPLIES.fuelPhoto3()]);

    // Trigger OCR pipeline (non-blocking)
    triggerOcrPipeline(existing.id).catch(err =>
      console.error('[LINE] OCR trigger failed:', err)
    );
    return;
  }

  // All slots filled → start new fuel_event
  await supabase.from('fuel_events').insert({
    driver_id: driverId,
    status: 'waiting_data',
    photo_pump_url: imageUrl,
  });
  await replyMessage(replyToken, [REPLIES.fuelPhoto1()]);
}

// ── Trigger OCR (calls our OCR API) ──────────────────────────

async function triggerOcrPipeline(fuelEventId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  await fetch(`${baseUrl}/api/fuel/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY || '',
    },
    body: JSON.stringify({ fuel_event_id: fuelEventId }),
  });
}

// ── Advance Request Handler ───────────────────────────────────

async function handleAdvanceRequest(
  driver: { id: string; name: string; monthly_advance_limit: number; line_user_id: string },
  text: string,
  replyToken: string,
  lineMessageId?: string
): Promise<void> {
  const parsed = parseAdvanceRequest(text);
  if (!parsed) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: 'ขออภัยครับ ไม่เข้าใจคำขอ\nกรุณาพิมพ์ "ขอเบิก [จำนวน] บาท [เหตุผล]"\nเช่น "ขอเบิก 500 บาท ค่าข้าว"',
    }]);
    return;
  }

  const { amount, reason } = parsed;
  const monthYear = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  // Check monthly advance usage
  const { data: monthAdvances } = await supabase
    .from('advance_requests')
    .select('amount')
    .eq('driver_id', driver.id)
    .eq('month_year', monthYear)
    .in('status', ['approved', 'paid'])
    .is('deleted_at', null);

  const usedThisMonth = (monthAdvances || []).reduce((sum, a) => sum + a.amount, 0);
  const limit = driver.monthly_advance_limit || 5000;

  if (usedThisMonth + amount > limit) {
    await replyMessage(replyToken, [REPLIES.advanceOverLimit(limit)]);
    return;
  }

  // Create advance request
  const { data: advance } = await supabase
    .from('advance_requests')
    .insert({
      driver_id: driver.id,
      amount,
      reason,
      status: 'pending',
      requested_via: 'line',
      month_year: monthYear,
    })
    .select()
    .single();

  // Link line_message to advance
  if (lineMessageId && advance) {
    await supabase
      .from('line_messages')
      .update({ advance_request_id: advance.id, processed: true })
      .eq('id', lineMessageId);
  }

  await replyMessage(replyToken, [REPLIES.advanceReceived(amount, reason)]);

  // Notify Bank (if they have LINE account)
  const { data: bankUser } = await supabase
    .from('users')
    .select('line_user_id')
    .eq('role', 'bank')
    .eq('is_active', true)
    .not('line_user_id', 'is', null)
    .limit(1)
    .single();

  if (bankUser?.line_user_id) {
    await pushMessage(bankUser.line_user_id, [{
      type: 'text',
      text: `💰 คนขับ ${driver.name} ขอเบิก ${amount.toLocaleString('th-TH')} บาท\nเหตุผล: ${reason}\nรอการอนุมัติ`,
    }]);
  }
}

// ── LINE Payload Types ────────────────────────────────────────

interface LineWebhookPayload {
  events: LineEvent[];
  destination: string;
}

interface LineEvent {
  type: string;
  replyToken: string;
  source: { userId: string; type: string };
  message: {
    id: string;
    type: string;
    text: string;
  };
  timestamp: number;
}
