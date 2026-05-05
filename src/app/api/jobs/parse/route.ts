import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface ParsedJob {
  origin: string | null
  destination: string | null
  product: string | null
  weight_kg: number | null
  selling_price: number | null
  customer_name: string | null
  payment_type: 'prepaid' | 'on_completion' | 'credit' | null
  notes: string | null
}

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วย AI สำหรับบริษัทขนส่งรถพ่วงไทย
งานของคุณคือแปลงข้อความภาษาไทย (หรือภาษาอังกฤษ) ที่บรรยายงานขนส่ง
ให้เป็น JSON ที่มีโครงสร้างครบถ้วน

กฎ:
- origin: จังหวัดหรือสถานที่ต้นทาง (string หรือ null)
- destination: จังหวัดหรือสถานที่ปลายทาง (string หรือ null)
- product: ชื่อสินค้าที่ขนส่ง เช่น ข้าวโพด มัน น้ำตาล ยาง (string หรือ null)
- weight_kg: น้ำหนักเป็นกิโลกรัม (number หรือ null) — ถ้าระบุเป็นตัน ให้คูณ 1000
- selling_price: ราคาค่าขนส่ง เป็นบาท (number หรือ null) — ไม่ต้องใส่ทศนิยมถ้าไม่มี
- customer_name: ชื่อลูกค้าหรือบริษัท (string หรือ null)
- payment_type: วิธีการชำระเงิน — "prepaid" (จ่ายล่วงหน้า), "on_completion" (จ่ายเมื่อส่งงาน), "credit" (เครดิต) หรือ null
- notes: ข้อมูลอื่นๆ ที่เกี่ยวข้อง (string หรือ null)

ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น`

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { text } = body as { text?: string }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'กรุณาใส่ข้อความที่ต้องการแปลง' },
        { status: 400 }
      )
    }

    if (text.trim().length > 2000) {
      return NextResponse.json(
        { error: 'ข้อความยาวเกินไป (สูงสุด 2000 ตัวอักษร)' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'ไม่ได้ตั้งค่า OpenAI API Key' },
        { status: 500 }
      )
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.trim() },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        { error: 'ไม่สามารถแปลงข้อความได้ กรุณาลองใหม่' },
        { status: 500 }
      )
    }

    let parsed: ParsedJob
    try {
      parsed = JSON.parse(rawContent) as ParsedJob
    } catch {
      return NextResponse.json(
        { error: 'ผลลัพธ์จาก AI ไม่ถูกต้อง กรุณาลองใหม่' },
        { status: 500 }
      )
    }

    // Sanitize and validate the parsed result
    const result: ParsedJob = {
      origin: typeof parsed.origin === 'string' ? parsed.origin.trim() || null : null,
      destination: typeof parsed.destination === 'string' ? parsed.destination.trim() || null : null,
      product: typeof parsed.product === 'string' ? parsed.product.trim() || null : null,
      weight_kg: typeof parsed.weight_kg === 'number' && parsed.weight_kg > 0 ? parsed.weight_kg : null,
      selling_price: typeof parsed.selling_price === 'number' && parsed.selling_price > 0 ? parsed.selling_price : null,
      customer_name: typeof parsed.customer_name === 'string' ? parsed.customer_name.trim() || null : null,
      payment_type: ['prepaid', 'on_completion', 'credit'].includes(parsed.payment_type as string)
        ? parsed.payment_type
        : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() || null : null,
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[API /api/jobs/parse] Error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}
