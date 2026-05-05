// ============================================================
// LINE Webhook Signature Verification + Intent Detection
// ============================================================

import crypto from 'crypto';

/**
 * Verify LINE webhook signature
 * X-Line-Signature = Base64(HMAC-SHA256(body, channelSecret))
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error('[LINE] LINE_CHANNEL_SECRET not configured');
    return false;
  }
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// ── Intent Detection ──────────────────────────────────────────

export type MessageIntent =
  | 'fuel_photo'
  | 'advance_request'
  | 'odometer'
  | 'job_accept'
  | 'unknown';

export interface ParsedAdvanceRequest {
  amount: number;
  reason: string;
}

/** Detect intent from a text message */
export function detectTextIntent(text: string): MessageIntent {
  const normalized = text.trim().toLowerCase();

  // Advance request: "ขอเบิก", "เบิกเงิน"
  if (/ขอเบิก|เบิกเงิน/.test(normalized)) return 'advance_request';

  // Odometer: "ไมล์", "km", "กิโล" followed by digits
  if (/ไมล์|กิโล|\bkm\b/.test(normalized) && /\d/.test(normalized)) return 'odometer';

  // Job accept: "รับงาน", "โอเค", "ok"
  if (/รับงาน|โอเค|\bok\b|okay/.test(normalized)) return 'job_accept';

  return 'unknown';
}

/** Parse advance request from text: "ขอเบิก 500 บาท ค่าข้าว" */
export function parseAdvanceRequest(text: string): ParsedAdvanceRequest | null {
  // Match amount: digits (with optional comma) before บาท or after ขอเบิก
  const amountMatch = text.match(/(?:ขอเบิก|เบิก)\s*([\d,]+)/);
  if (!amountMatch) return null;

  const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
  if (isNaN(amount) || amount <= 0) return null;

  // Reason: everything after "บาท" or after the amount
  let reason = text.replace(/(?:ขอเบิก|เบิกเงิน)\s*[\d,]+\s*(?:บาท)?/i, '').trim();
  if (!reason) reason = 'ไม่ระบุเหตุผล';

  return { amount, reason };
}

/** Parse odometer reading from text */
export function parseOdometerReading(text: string): number | null {
  // Extract digits near ไมล์/กิโล/km
  const match = text.match(/(\d[\d,]*)\s*(?:ไมล์|กิโล|km|กม)/i)
    || text.match(/(?:ไมล์|กิโล|km|กม)[^\d]*(\d[\d,]*)/i);
  if (!match) return null;
  const value = parseInt(match[1].replace(/,/g, ''), 10);
  return isNaN(value) ? null : value;
}
