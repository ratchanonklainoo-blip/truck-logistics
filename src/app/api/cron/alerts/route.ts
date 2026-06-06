import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Vercel Cron — runs daily at 20:00 ICT (13:00 UTC)
// Calls the alerts/check endpoint with service-role auth
export async function GET(req: Request): Promise<NextResponse> {
  // Verify this is called by Vercel Cron (not public)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://truck-logistics.vercel.app';
    const res = await fetch(`${baseUrl}/api/alerts/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET || '',
      },
    });

    const data = await res.json();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      alerts_result: data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
