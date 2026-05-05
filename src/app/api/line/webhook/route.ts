// LINE Webhook Handler — POST /api/line/webhook
// Supports:
//   !เบิก [ชื่อ] [จำนวน] [เหตุผล]    → สร้าง advance_request
//   !เติมน้ำมัน [ชื่อ]                → multi-step fuel flow
//   รูปภาพ (จากคนขับ)                 → fuel photo OCR pipeline

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { verifyLineSignature } from '@/lib/line/webhook';
import { replyMessage, pushMessage } from '@/lib/line/client';

export const dynamic = 'force-dynamic';

const FUEL_GROUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface LineWebhookPayload { events: LineEvent[]; destination: string; }
interface LineEvent {
  type: string;
  replyToken: string;
  source: { userId: string; type: string; groupId?: string };
  message: { id: string; type: string; text: string };
  timestamp: number;
}

interface DriverRow {
  id: string;
  name: string;
  nickname: string;
  line_user_id: string | null;
  monthly_advance_limit: number;
}

interface LineSession {
  id: string;
  line_user_id: string;
  driver_id: string | null;
  state: string;
  data: Record<string, unknown>;
  expires_at: string;
}

// ─────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────
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
    catch (err) { console.error('[LINE Webhook] Event error:', err); }
  }
  return NextResponse.json({ ok: true });
}

// ─────────────────────────────────────────────
// Event Router
// ─────────────────────────────────────────────
async function processEvent(event: LineEvent, supabase: SupabaseClient): Promise<void> {
  if (event.type !== 'message') return;
  const { message, source, replyToken } = event;
  const lineUserId = source.userId;

  // Save raw message
  await supabase.from('line_messages').insert({
    line_user_id: lineUserId,
    driver_id: null,
    message_type: message.type,
    content: message.type === 'text' ? message.text : null,
    image_url: null,
    intent: null,
    processed: false,
    raw_payload: event as unknown as Record<string, unknown>,
  });

  // IMAGE → fuel photo pipeline
  if (message.type === 'image') {
    const driver = await findDriverByLineId(lineUserId, supabase);
    if (!driver) {
      await replyMessage(replyToken, [{ type: 'text', text: 'ขออภัยครับ ไม่พบข้อมูลคนขับ กรุณาติดต่อผู้จัดการ' }]);
      return;
    }
    await handleFuelPhoto(driver, message.id, replyToken, supabase);
    return;
  }

  // TEXT only below
  if (message.type !== 'text') return;
  const text = message.text.trim();

  // 1. !commands
  if (text.startsWith('!เบิก')) {
    await handleAdvanceCommand(lineUserId, text, replyToken, supabase);
    return;
  }
  if (text.startsWith('!เติมน้ำมัน')) {
    await handleFuelCommand(lineUserId, text, replyToken, supabase);
    return;
  }

  // 2. Active session (multi-step reply)
  const session = await getActiveSession(lineUserId, supabase);
  if (session) {
    await handleSessionReply(lineUserId, text, session, replyToken, supabase);
    return;
  }

  // 3. Legacy keywords
  const lowerText = text.toLowerCase();
  if (lowerText.includes('ขอเบิก') || lowerText.includes('เบิกเงิน')) {
    await handleAdvanceCommand(lineUserId, '!เบิก ' + text.replace(/ขอเบิก|เบิกเงิน/gi, ''), replyToken, supabase);
    return;
  }
}

// ─────────────────────────────────────────────
// !เบิก Handler
// ─────────────────────────────────────────────
// Format: !เบิก [ชื่อ] [จำนวน] [เหตุผล]
async function handleAdvanceCommand(
  lineUserId: string, text: string, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  const parts = text.replace(/^!เบิก\s*/, '').trim().split(/\s+/);

  let driver = await findDriverByLineId(lineUserId, supabase);
  let remaining = parts;

  if (!driver && parts.length > 0) {
    const resolved = await findDriverByNickname(parts[0], supabase);
    if (resolved) { driver = resolved; remaining = parts.slice(1); }
  }

  if (!driver) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: '❌ ไม่พบข้อมูลคนขับ\nรูปแบบ: !เบิก [ชื่อ] [จำนวน] [เหตุผล]\nเช่น: !เบิก จง 2000 ค่าข้าว',
    }]);
    return;
  }

  const amountIdx = remaining.findIndex(p => /^\d+$/.test(p));
  if (amountIdx === -1) {
    await upsertSession(lineUserId, driver.id, 'advance_waiting_data', {}, supabase);
    await replyMessage(replyToken, [{
      type: 'text',
      text: `💰 ขอเบิกเงิน — คนขับ: ${driver.nickname || driver.name}\n\nส่งจำนวนเงินและเหตุผล:\nเช่น: 2000 ค่าข้าว`,
    }]);
    return;
  }

  const amount = parseInt(remaining[amountIdx], 10);
  const reason = remaining.slice(amountIdx + 1).join(' ') || remaining.slice(0, amountIdx).join(' ') || 'ไม่ระบุ';

  await createAdvanceRequest(driver, amount, reason, replyToken, supabase);
}

// ─────────────────────────────────────────────
// !เติมน้ำมัน Handler
// ─────────────────────────────────────────────
// Format: !เติมน้ำมัน [ชื่อ]
async function handleFuelCommand(
  lineUserId: string, text: string, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  const parts = text.replace(/^!เติมน้ำมัน\s*/, '').trim().split(/\s+/).filter(Boolean);

  let driver = await findDriverByLineId(lineUserId, supabase);

  if (!driver && parts.length > 0) {
    driver = await findDriverByNickname(parts[0], supabase);
  }

  if (!driver) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: '❌ ไม่พบข้อมูลคนขับ\nรูปแบบ: !เติมน้ำมัน [ชื่อ]\nเช่น: !เติมน้ำมัน จง',
    }]);
    return;
  }

  // Create a new fuel event in waiting_data state
  await supabase.from('fuel_events').insert({
    driver_id: driver.id,
    status: 'waiting_data',
  });

  await upsertSession(lineUserId, driver.id, 'fuel_waiting_photos', {}, supabase);

  await replyMessage(replyToken, [{
    type: 'text',
    text: `⛽ เติมน้ำมัน — คนขับ: ${driver.nickname || driver.name}\n\nกรุณาส่งรูปภาพ 3 รูปตามลำดับ:\n1️⃣ หน้าปัดปั๊ม (ลิตร + ราคา)\n2️⃣ ใบเสร็จ / หลักฐานจ่ายเงิน\n3️⃣ เลขไมล์รถ (หน้าปัดรถ)`,
  }]);
}

// ─────────────────────────────────────────────
// Session Reply Handler (multi-step)
// ─────────────────────────────────────────────
async function handleSessionReply(
  lineUserId: string, text: string, session: LineSession, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  if (session.state === 'advance_waiting_data') {
    // Expect: "[amount] [reason]"
    const parts = text.trim().split(/\s+/);
    const amountIdx = parts.findIndex(p => /^\d+$/.test(p));
    if (amountIdx === -1) {
      await replyMessage(replyToken, [{ type: 'text', text: '❌ กรุณาส่งจำนวนเงิน เช่น: 2000 ค่าข้าว' }]);
      return;
    }
    const amount = parseInt(parts[amountIdx], 10);
    const reason = parts.filter((_, i) => i !== amountIdx).join(' ') || 'ไม่ระบุ';

    const driver = await findDriverById(session.driver_id!, supabase);
    if (!driver) { await clearSession(session.id, supabase); return; }

    await createAdvanceRequest(driver, amount, reason, replyToken, supabase);
    await clearSession(session.id, supabase);
    return;
  }

  // Unknown session state — clear it
  await clearSession(session.id, supabase);
}

// ─────────────────────────────────────────────
// Fuel Photo Handler (image messages)
// ─────────────────────────────────────────────
async function handleFuelPhoto(
  driver: DriverRow, messageId: string, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  // Download image from LINE CDN and upload to Supabase Storage
  const imageUrl = await downloadLineImage(messageId);
  if (!imageUrl) {
    await replyMessage(replyToken, [{ type: 'text', text: '❌ ไม่สามารถดาวน์โหลดรูปได้ กรุณาลองใหม่' }]);
    return;
  }
  await groupFuelPhoto(driver.id, imageUrl, replyToken, supabase);
}

async function downloadLineImage(messageId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    // Return as data URL for OCR processing (Supabase Storage upload would go here in production)
    return `data:image/jpeg;base64,${base64}`;
  } catch { return null; }
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
    await replyMessage(replyToken, [{ type: 'text', text: '📸 ได้รับรูปที่ 1/3 (หน้าปัดปั๊ม)\n\nกรุณาส่งรูปที่ 2: ใบเสร็จ / หลักฐานจ่ายเงิน' }]);
    return;
  }
  if (!existing.photo_pump_url) {
    await supabase.from('fuel_events').update({ photo_pump_url: imageUrl }).eq('id', existing.id);
    await replyMessage(replyToken, [{ type: 'text', text: '📸 ได้รับรูปที่ 1/3 (หน้าปัดปั๊ม)\n\nกรุณาส่งรูปที่ 2: ใบเสร็จ / หลักฐานจ่ายเงิน' }]);
    return;
  }
  if (!existing.photo_payment_url) {
    await supabase.from('fuel_events').update({ photo_payment_url: imageUrl }).eq('id', existing.id);
    await replyMessage(replyToken, [{ type: 'text', text: '📸 ได้รับรูปที่ 2/3 (ใบเสร็จ)\n\nกรุณาส่งรูปที่ 3: เลขไมล์รถ' }]);
    return;
  }
  if (!existing.photo_odometer_url) {
    await supabase.from('fuel_events').update({ photo_odometer_url: imageUrl, status: 'waiting_ocr' }).eq('id', existing.id);
    await replyMessage(replyToken, [{ type: 'text', text: '✅ ได้รับครบ 3 รูปแล้ว!\n\nระบบกำลังประมวลผล OCR...\nผู้จัดการจะตรวจสอบและอนุมัติเร็วๆ นี้' }]);
    triggerOcrPipeline(existing.id).catch(err => console.error('[LINE] OCR trigger failed:', err));
    return;
  }
  // All 3 filled — start new event
  await supabase.from('fuel_events').insert({ driver_id: driverId, status: 'waiting_data', photo_pump_url: imageUrl });
  await replyMessage(replyToken, [{ type: 'text', text: '📸 ได้รับรูปที่ 1/3 (หน้าปัดปั๊ม)\n\nกรุณาส่งรูปที่ 2: ใบเสร็จ / หลักฐานจ่ายเงิน' }]);
}

async function triggerOcrPipeline(fuelEventId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://truck-logistics-me62.vercel.app';
  await fetch(`${baseUrl}/api/fuel/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
    body: JSON.stringify({ fuel_event_id: fuelEventId }),
  });
}

// ─────────────────────────────────────────────
// Advance Request Creator
// ─────────────────────────────────────────────
async function createAdvanceRequest(
  driver: DriverRow, amount: number, reason: string, replyToken: string, supabase: SupabaseClient
): Promise<void> {
  const monthYear = new Date().toISOString().slice(0, 7);
  const limit = driver.monthly_advance_limit || 5000;

  const { data: monthAdvances } = await supabase.from('advance_requests')
    .select('amount').eq('driver_id', driver.id).eq('month_year', monthYear)
    .in('status', ['approved', 'paid']).is('deleted_at', null);

  const used = (monthAdvances || []).reduce((s: number, a: { amount: number }) => s + a.amount, 0);

  if (used + amount > limit) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: `❌ ยอดเบิกเกินวงเงินประจำเดือน\n\nใช้ไปแล้ว: ${used.toLocaleString('th-TH')} บาท\nวงเงิน: ${limit.toLocaleString('th-TH')} บาท\nขอได้อีก: ${Math.max(0, limit - used).toLocaleString('th-TH')} บาท`,
    }]);
    return;
  }

  const { data: advance } = await supabase.from('advance_requests').insert({
    driver_id: driver.id,
    amount,
    reason,
    status: 'pending',
    requested_via: 'line',
    month_year: monthYear,
  }).select().single();

  if (advance) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: `✅ รับเรื่องขอเบิกเงินแล้ว\n\nคนขับ: ${driver.nickname || driver.name}\nจำนวน: ${amount.toLocaleString('th-TH')} บาท\nเหตุผล: ${reason}\n\nรอผู้จัดการอนุมัติ`,
    }]);

    // Notify manager
    const { data: setting } = await supabase.from('app_settings')
      .select('setting_value').eq('setting_key', 'manager_line_user_id').single();
    const managerId = setting?.setting_value as string | undefined;
    if (managerId) {
      await pushMessage(managerId, [{
        type: 'text',
        text: `💰 คนขับ ${driver.nickname || driver.name} ขอเบิก ${amount.toLocaleString('th-TH')} บาท\nเหตุผล: ${reason}\n\nกรุณาเข้าระบบเพื่ออนุมัติ`,
      }]);
    }
  }
}

// ─────────────────────────────────────────────
// Session Helpers
// ─────────────────────────────────────────────
async function getActiveSession(lineUserId: string, supabase: SupabaseClient): Promise<LineSession | null> {
  const { data } = await supabase.from('line_sessions')
    .select('*').eq('line_user_id', lineUserId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).single();
  return data || null;
}

async function upsertSession(
  lineUserId: string, driverId: string, state: string,
  data: Record<string, unknown>, supabase: SupabaseClient
): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  await supabase.from('line_sessions').upsert({
    line_user_id: lineUserId,
    driver_id: driverId,
    state,
    data,
    expires_at: expiresAt,
  }, { onConflict: 'line_user_id' });
}

async function clearSession(sessionId: string, supabase: SupabaseClient): Promise<void> {
  await supabase.from('line_sessions').delete().eq('id', sessionId);
}

// ─────────────────────────────────────────────
// Driver Lookup Helpers
// ─────────────────────────────────────────────
async function findDriverByLineId(lineUserId: string, supabase: SupabaseClient): Promise<DriverRow | null> {
  const { data } = await supabase.from('drivers')
    .select('id, name, nickname, line_user_id, monthly_advance_limit')
    .eq('line_user_id', lineUserId).eq('is_active', true).is('deleted_at', null).single();
  return data || null;
}

async function findDriverByNickname(nickname: string, supabase: SupabaseClient): Promise<DriverRow | null> {
  const { data } = await supabase.from('drivers')
    .select('id, name, nickname, line_user_id, monthly_advance_limit')
    .ilike('nickname', nickname.trim()).eq('is_active', true).is('deleted_at', null).limit(1).single();
  return data || null;
}

async function findDriverById(driverId: string, supabase: SupabaseClient): Promise<DriverRow | null> {
  const { data } = await supabase.from('drivers')
    .select('id, name, nickname, line_user_id, monthly_advance_limit')
    .eq('id', driverId).is('deleted_at', null).single();
  return data || null;
}
