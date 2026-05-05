// ============================================================
// Fuel OCR — OpenAI GPT-4o Vision
// ============================================================

export interface FuelOcrExtracted {
  station_name: string | null;
  amount_baht: number | null;
  fuel_liters: number | null;
  price_per_liter: number | null;
  odometer: number | null;
  payment_method: string | null;
}

export interface OcrImageResult {
  image_type: 'pump' | 'payment' | 'odometer';
  image_url: string;
  extracted: FuelOcrExtracted;
  confidence: number;
  raw_response: Record<string, unknown>;
  tokens_used: number;
}

const PROMPTS: Record<'pump' | 'payment' | 'odometer', string> = {
  pump: `คุณเป็น OCR ผู้เชี่ยวชาญด้านใบเสร็จน้ำมันไทย
วิเคราะห์ภาพหัวจ่ายน้ำมัน/ใบเสร็จปั๊มน้ำมัน และดึงข้อมูลต่อไปนี้:
- station_name: ชื่อปั๊มน้ำมัน (เช่น PTT, SHELL, CALTEX, ESSO, BANGCHAK, เบนซิล)
- amount_baht: ยอดเงินรวม (ตัวเลข ไม่มี comma)
- fuel_liters: จำนวนลิตร (ตัวเลขทศนิยม)
- price_per_liter: ราคาต่อลิตร (ตัวเลขทศนิยม)

ตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่น:
{
  "station_name": string | null,
  "amount_baht": number | null,
  "fuel_liters": number | null,
  "price_per_liter": number | null,
  "confidence": number (0.0-1.0 ความมั่นใจ)
}`,

  payment: `คุณเป็น OCR ผู้เชี่ยวชาญด้านหลักฐานการชำระเงิน
วิเคราะห์ภาพหลักฐานการจ่ายเงินน้ำมัน (สลิป QR/โอน/เงินสด) และดึง:
- amount_baht: ยอดเงินที่จ่าย (ตัวเลข)
- payment_method: วิธีชำระ (cash/transfer/qr)
- station_name: ชื่อร้าน/ปั๊ม (ถ้ามี)

ตอบเป็น JSON เท่านั้น:
{
  "amount_baht": number | null,
  "payment_method": string | null,
  "station_name": string | null,
  "confidence": number (0.0-1.0)
}`,

  odometer: `คุณเป็น OCR ผู้เชี่ยวชาญด้านเลขไมล์รถบรรทุก
วิเคราะห์ภาพหน้าปัดมาตรวัดระยะทาง (odometer) และดึง:
- odometer: ตัวเลขไมล์ที่แสดงบนมาตรวัด (ตัวเลขเต็ม ไม่มีทศนิยม)

ตอบเป็น JSON เท่านั้น:
{
  "odometer": number | null,
  "confidence": number (0.0-1.0)
}`,
};

/** Run OCR on a single image using GPT-4o Vision */
export async function runOcrOnImage(
  imageUrl: string,
  imageType: 'pump' | 'payment' | 'odometer'
): Promise<OcrImageResult> {
  const prompt = PROMPTS[imageType];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{}';
  const tokensUsed: number = data.usage?.total_tokens || 0;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[OCR] Failed to parse response:', content);
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

  const extracted: FuelOcrExtracted = {
    station_name: (parsed.station_name as string) || null,
    amount_baht: typeof parsed.amount_baht === 'number' ? parsed.amount_baht : null,
    fuel_liters: typeof parsed.fuel_liters === 'number' ? parsed.fuel_liters : null,
    price_per_liter: typeof parsed.price_per_liter === 'number' ? parsed.price_per_liter : null,
    odometer: typeof parsed.odometer === 'number' ? parsed.odometer : null,
    payment_method: (parsed.payment_method as string) || null,
  };

  return {
    image_type: imageType,
    image_url: imageUrl,
    extracted,
    confidence,
    raw_response: parsed,
    tokens_used: tokensUsed,
  };
}

/** Merge OCR results from 3 images into one consolidated FuelOcrExtracted */
export function mergeOcrResults(results: OcrImageResult[]): {
  merged: FuelOcrExtracted;
  overallConfidence: number;
} {
  const merged: FuelOcrExtracted = {
    station_name: null,
    amount_baht: null,
    fuel_liters: null,
    price_per_liter: null,
    odometer: null,
    payment_method: null,
  };

  for (const r of results) {
    const e = r.extracted;
    if (e.station_name && !merged.station_name) merged.station_name = e.station_name;
    if (e.amount_baht != null && merged.amount_baht == null) merged.amount_baht = e.amount_baht;
    if (e.fuel_liters != null && merged.fuel_liters == null) merged.fuel_liters = e.fuel_liters;
    if (e.price_per_liter != null && merged.price_per_liter == null) merged.price_per_liter = e.price_per_liter;
    if (e.odometer != null && merged.odometer == null) merged.odometer = e.odometer;
    if (e.payment_method && !merged.payment_method) merged.payment_method = e.payment_method;
  }

  // Overall confidence = average of all results (weighted)
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  return { merged, overallConfidence: avgConfidence };
}

/** Detect anomaly: amount > 20% above driver's average */
export function detectFuelAnomaly(
  amountBaht: number,
  driverAvgBaht: number
): { isAnomaly: boolean; reason: string | null } {
  if (driverAvgBaht <= 0) return { isAnomaly: false, reason: null };
  const threshold = driverAvgBaht * 1.2;
  if (amountBaht > threshold) {
    return {
      isAnomaly: true,
      reason: `ยอดเติมน้ำมัน ${amountBaht.toLocaleString('th-TH')} บาท สูงกว่าค่าเฉลี่ย (${Math.round(driverAvgBaht).toLocaleString('th-TH')} บาท) เกิน 20%`,
    };
  }
  return { isAnomaly: false, reason: null };
}
