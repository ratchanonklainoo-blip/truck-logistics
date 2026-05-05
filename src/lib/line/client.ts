// ============================================================
// LINE Messaging API Client
// ============================================================

const LINE_API_BASE = 'https://api.line.me/v2/bot';

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
});

/** Reply to a LINE message (uses replyToken — valid for 30 seconds) */
export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[LINE] replyMessage failed:', err);
  }
}

/** Push message to a specific LINE user (does not need replyToken) */
export async function pushMessage(lineUserId: string, messages: LineMessage[]): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[LINE] pushMessage failed:', err);
  }
}

/** Download image content from LINE CDN */
export async function downloadLineImage(messageId: string): Promise<Buffer> {
  const res = await fetch(`${LINE_API_BASE}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Failed to download LINE image: ${messageId}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// LINE Message types
export interface LineTextMessage {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface LineMessage {
  type: string;
  text?: string;
  [key: string]: unknown;
}

// ── Reply Templates ────────────────────────────────────────────
export const REPLIES = {
  fuelPhoto1: (): LineTextMessage => ({
    type: 'text',
    text: 'ได้รับรูปที่ 1 แล้ว ✅\nส่งรูปการจ่ายเงินด้วยนะครับ',
  }),
  fuelPhoto2: (): LineTextMessage => ({
    type: 'text',
    text: 'ได้รับรูปที่ 2 แล้ว ✅\nส่งรูปเลขไมล์ด้วยนะครับ',
  }),
  fuelPhoto3: (): LineTextMessage => ({
    type: 'text',
    text: 'ได้รับครบแล้ว ✅\nกำลังประมวลผล รอสักครู่นะครับ',
  }),
  ocrSuccess: (station: string, liters: number, amount: number): LineTextMessage => ({
    type: 'text',
    text: `ตรวจสอบน้ำมันแล้ว 🔍\nปั๊ม: ${station}\nจำนวน: ${liters.toFixed(2)} ลิตร\nราคา: ${amount.toLocaleString('th-TH')} บาท`,
  }),
  ocrNeedsReview: (): LineTextMessage => ({
    type: 'text',
    text: 'ได้รับรูปครบแล้ว ✅\nข้อมูลไม่ชัดเจน รอทีมงานตรวจสอบนะครับ',
  }),
  advanceReceived: (amount: number, reason: string): LineTextMessage => ({
    type: 'text',
    text: `รับคำขอเบิกเงิน ${amount.toLocaleString('th-TH')} บาท\nเหตุผล: ${reason}\nรอการอนุมัตินะครับ ⏳`,
  }),
  advanceOverLimit: (limit: number): LineTextMessage => ({
    type: 'text',
    text: `ขออภัยครับ ยอดเบิกเดือนนี้เต็มแล้ว\n(วงเงินสูงสุด: ${limit.toLocaleString('th-TH')} บาท)`,
  }),
  advanceApproved: (amount: number): LineTextMessage => ({
    type: 'text',
    text: `อนุมัติการเบิก ${amount.toLocaleString('th-TH')} บาท แล้วนะครับ ✅`,
  }),
  advanceRejected: (): LineTextMessage => ({
    type: 'text',
    text: 'ขออภัยนะครับ ไม่อนุมัติการเบิกครั้งนี้',
  }),
  unknownMessage: (): LineTextMessage => ({
    type: 'text',
    text: 'รับข้อความแล้วครับ 👍\nหากต้องการเติมน้ำมัน ส่งรูปหัวจ่าย รูปการจ่ายเงิน และรูปไมล์\nหากต้องการเบิกเงิน พิมพ์ "ขอเบิก [จำนวน] บาท [เหตุผล]"',
  }),
} as const;
