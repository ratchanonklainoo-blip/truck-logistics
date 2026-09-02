import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isShortMapsLink, parseGoogleMapsLink } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';

  if (!isShortMapsLink(url)) {
    return NextResponse.json({ error: 'ไม่ใช่ลิงก์ Google Maps แบบย่อที่รองรับ (maps.app.goo.gl หรือ goo.gl/maps)' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    });
    const coord = parseGoogleMapsLink(res.url);
    if (!coord) {
      return NextResponse.json({ error: 'แปลงลิงก์ไม่สำเร็จ — ไม่พบพิกัดในหน้าเป้าหมาย' }, { status: 422 });
    }
    return NextResponse.json(coord);
  } catch {
    return NextResponse.json({ error: 'เชื่อมต่อเพื่อแปลงลิงก์ไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
  }
}
