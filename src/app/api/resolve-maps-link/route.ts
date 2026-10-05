import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isShortMapsLink, parseGoogleMapsLink } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';

  if (!isShortMapsLink(url)) {
    return NextResponse.json({ error: 'ลิงก์นี้ไม่ใช่ลิงก์แชร์จาก Google Maps — เปิดแอป Google Maps กดหมุดสถานที่ > แชร์ > คัดลอกลิงก์ (ขึ้นต้น maps.app.goo.gl) แล้ววางใหม่ หรือพิมพ์พิกัดแบบ 13.7563, 100.5018' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    });
    const coord = parseGoogleMapsLink(res.url);
    if (!coord) {
      return NextResponse.json({ error: 'ลิงก์นี้ไม่มีพิกัด (มักเป็นลิงก์ชื่อร้าน/ผลค้นหา) — ใน Google Maps ให้กดค้างตรงจุดบนแผนที่จนขึ้นหมุดแดง แล้วกดแชร์ลิงก์ของหมุดนั้น หรือคัดลอกตัวเลขพิกัดที่ขึ้นด้านบน (เช่น 13.7563, 100.5018) มาวางแทน' }, { status: 422 });
    }
    return NextResponse.json(coord);
  } catch {
    return NextResponse.json({ error: 'เปิดลิงก์ไม่สำเร็จ (อินเทอร์เน็ตหรือ Google ไม่ตอบ) — รอสักครู่แล้ววางลิงก์ใหม่ หรือพิมพ์พิกัดแบบ 13.7563, 100.5018 แทน' }, { status: 502 });
  }
}
