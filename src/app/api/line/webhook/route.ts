// LINE Webhook Handler — POST /api/line/webhook

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { verifyLineSignature, detectTextIntent, parseAdvanceRequest, parseOdometerReading } from '@/lib/line/webhook';
import { replyMessage, pushMessage, downloadLineImage, REPLIES } from '@/lib/line/client';

export const dynamic = 'force-dynamic';

const FUEL_GROUP_WINDOW_MS = 30 * 60 * 1000;

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature') || '';

  if (!verifyLineSignature(rawBody, signature)) {
    console.warn('[LINE Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: LineWebhookPayload;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = getServiceClient();

  for (const event of payload.events) {
    try { await processEvent(event, supabase); }
    catch (err) { console.error('[LINE Webhook] Error:', err); }
  }

  return NextResponse.json({ ok: true });
}

async function processEvent(event: LineEvent, supabase: SupabaseClient): Promise<void> {
  if (event.type !== 'message') return;
  const { message, source, replyToken } = event;
  const lineUserId = source.userId;

  const { data: driver } = await supabase
    .from('drivers').select('*')
    .eq('line_user_id', lineUserId).eq('is_active', true).is('deleted_at', null).single();

  const { data: savedMsg } = await supabase.from('line_messages').insert({
    line_user_id: lineUserId,
    driver_id: driver?.id || null,
    message_type: message.type,
    content: message.type === 'text' ? message.text : null,
    image_url: null,
    intent: null,
    processed: false,
    raw_payload: event as unknown as Record<string, unknown>,
  }).select().single();

  if (message.type === 'image') {
    if (!driver) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ขออภัยครับ ไม่พบข้อมูลคนขับ' }]);
      return;
    }
    const imageBuffer = await downloadLineImage(message.id);
    const fileName = `fuel/${driver.id}/${Date.now()}_${message.id}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('line-images').upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) { console.error('[LINE] Upload failed:', uploadError); return; }
    const { data: { publicUrl } } = supabase.storage.from('line-images').getPublicUrl(fileName);
    await supabase.from('line_messages')
      .update({ image_url: publicUrl, intent: 'fuel_photo', processed: true }).eq('id', savedMsg?.id);
    await groupFuelPhoto(driver.id, publicUrl, replyToken, supabase);
    return;
  }

  if (message.type === 'text') {
    const intent = detectTextIntent(message.text);
    await supabase.from('line_messages')
      .update({ intent, processed: intent !== 'unknown' }).eq('id', savedMsg?.id);
    if (intent === 'advance_request') {
      if (!driver) {
        await replyMessage(replyToken, [{ type: 'text', text: 'ขออภัยครับ ไม่พบข้อมูลคนขับ' }]);
        return;
      }
      await handleAdvanceRequest(driver, message.text, replyToken, savedMsg?.id, supabase);
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
    await replyMessage(replyToken, [REPLIES.unknownMessage()]);
  }
}

async function groupFuelPhoto(
  driverId: string, imageUrl: string, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  const windowStart = new Date(Date.now() - FUEL_GROUP_WINDOW_MS).toISOString();

  const { data: existing } = await supabase.from('fuel_events').select('*')
    .eq('driver_id', driverId).eq('status', 'waiting_data')
    .gte('created_at', windowStart).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).single();

  if (!existing) {
    await supabase.from('fuel_events').insert({ driver_id: driverId, status: 'waiting_data', photo_pump_url: imageUrl });
    await replyMessage(replyToken, [REPLIES.fuelPhoto1()]);
    return;
  }
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
    await supabase.from('fuel_events').update({ photo_odometer_url: imageUrl, status: 'waiting_ocr' }).eq('id', existing.id);
    await replyMessage(replyToken, [REPLIES.fuelPhoto3()]);
    triggerOcrPipeline(existing.id).catch(err => console.error('[LINE] OCR trigger failed:', err));
    return;
  }
  // All 3 filled — start new
  await supabase.from('fuel_events').insert({ driver_id: driverId, status: 'waiting_data', photo_pump_url: imageUrl });
  await replyMessage(replyToken, [REPLIES.fuelPhoto1()]);
}

async function triggerOcrPipeline(fuelEventId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://truck-logistics-me62.vercel.app';
  await fetch(`${baseUrl}/api/fuel/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
    body: JSON.stringify({ fuel_event_id: fuelEventId }),
  });
}

async function handleAdvanceRequest(
  driver: { id: string; name: string; monthly_advance_limit: number; line_user_id: string },
  text: string, replyToken: string, lineMessageId: string | undefined, supabase: SupabaseClient
): Promise<void> {
  const parsed = parseAdvanceRequest(text);
  if (!parsed) {
    await replyMessage(replyToken, [{ type: 'text', text: 'กรุณาพิมพ์ "ขอเบิก [จำนวน] บาท [เหตุผล]"\nเช่น "ขอเบิก 500 บาท ค่าข้าว"' }]);
    return;
  }
  const { amount, reason } = parsed;
  const monthYear = new Date().toISOString().slice(0, 7);
  const { data: monthAdvances } = await supabase.from('advance_requests').select('amount')
    .eq('driver_id', driver.id).eq('month_year', monthYear).in('status', ['approved', 'paid']).is('deleted_at', null);
  const used = (monthAdvances || []).reduce((s: number, a: { amount: number }) => s + a.amount, 0);
  const limit = driver.monthly_advance_limit || 5000;
  if (used + amount > limit) {
    await replyMessage(replyToken, [REPLIES.advanceOverLimit(limit)]);
    return;
  }
  const { data: advance } = await supabase.from('advance_requests').insert({
    driver_id: driver.id, amount, reason, status: 'pending', requested_via: 'line', month_year: monthYear,
  }).select().single();
  if (lineMessageId && advance) {
    await supabase.from('line_messages').update({ advance_request_id: advance.id, processed: true }).eq('id', lineMessageId);
  }
  await replyMessage(replyToken, [REPLIES.advanceReceived(amount, reason)]);
  const { data: bankUser } = await supabase.from('users').select('line_user_id')
    .eq('role', 'bank').eq('is_active', true).not('line_user_id', 'is', null).limit(1).single();
  if (bankUser?.line_user_id) {
    await pushMessage(bankUser.line_user_id, [{
      type: 'text',
      text: `💰 คนขับ ${driver.name} ขอเบิก ${amount.toLocaleString('th-TH')} บาท\nเหตุผล: ${reason}`,
    }]);
  }
}

interface LineWebhookPayload { events: LineEvent[]; destination: string; }
interface LineEvent {
  type: string; replyToken: string;
  source: { userId: string; type: string };
  message: { id: string; type: string; text: string };
  timestamp: number;
}
