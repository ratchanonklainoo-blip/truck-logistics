// วันที่แบบเวลาไทย (UTC+7) เป็น 'YYYY-MM-DD' — ใช้แทน new Date().toISOString().slice(0, 10)
// ซึ่งเป็นวันที่ UTC (ช่วง 00:00–06:59 น. เวลาไทยจะได้วันของเมื่อวาน)
export function todayBangkok(offsetDays = 0, now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

// วันแรกของเดือนถัดไป ('YYYY-MM' → 'YYYY-MM-01') ใช้เป็นขอบบนแบบ .lt() แทนการเดาวันสิ้นเดือน
export function nextMonthStart(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

