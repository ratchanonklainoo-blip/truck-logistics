// อ่านอย่างเดียว: ดึงข้อมูลจริงผ่าน supabase CLI (linked) แล้วคำนวณรายงานรายเดือนด้วย lib เดียวกับ /api/reports/monthly
// รัน: node --import ./scripts/ts-hooks.mjs scripts/live-report.mts 2026-09 2026-03 ...
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMonthlyReport } from '../src/lib/monthlyReport.ts';
import { nextMonthStart } from '../src/lib/dateTh.ts';

export function sqlJson<T>(sql: string): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'lr-'));
  const f = path.join(dir, 'q.sql');
  writeFileSync(f, sql, 'utf8');
  const r = spawnSync('npx', ['--no-install', 'supabase', 'db', 'query', '--linked', '-o', 'json', '-f', f],
    { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout || '';
  const s = out.indexOf('{'), e = out.lastIndexOf('}');
  if (s < 0) throw new Error('query failed: ' + (r.stderr || out).slice(0, 500));
  const rows = JSON.parse(out.slice(s, e + 1)).rows as Record<string, unknown>[];
  const v = rows[0]?.j;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

export function loadMonth(ym: string) {
  const from = `${ym}-01`, to = nextMonthStart(ym);
  return sqlJson<{ trips: never[]; fixed: never[]; expenses: never[]; drivers: never[] }>(`
    select json_build_object(
      'trips', coalesce((select json_agg(json_build_object(
          'id', t.id, 'date', t.date, 'driver_id', t.driver_id, 'origin', t.origin, 'destination', t.destination,
          'transport_price', t.transport_price, 'trip_pay', t.trip_pay, 'fuel_cost', t.fuel_cost,
          'fuel_litres', t.fuel_litres, 'distance', t.distance, 'other_cost', t.other_cost, 'withdraw', t.withdraw,
          'drivers', (select row_to_json(d) from drivers d where d.id = t.driver_id)))
        from trips t where t.deleted_at is null and t.date >= '${from}' and t.date < '${to}'), '[]'::json),
      'fixed', coalesce((select json_agg(f) from fixed_expenses f where f.deleted_at is null), '[]'::json),
      'expenses', coalesce((select json_agg(e) from expenses e where e.deleted_at is null and e.date >= '${from}' and e.date < '${to}'), '[]'::json),
      'drivers', coalesce((select json_agg(d) from drivers d), '[]'::json)
    )::text j`);
}

export function lastDayOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('live-report.mts')) {
  const months = process.argv.slice(2);
  for (const ym of months.length ? months : ['2026-09']) {
    const d = loadMonth(ym);
    const rep = buildMonthlyReport({
      month_year: ym, dateFrom: `${ym}-01`, dateTo: lastDayOf(ym), todayDate: '2026-10-05',
      trips: d.trips, fixedExpenses: d.fixed, expenses: d.expenses,
    });
    const t = rep.totals;
    console.log(`${ym}: รายรับ ${t.total_revenue} น้ำมัน ${t.total_fuel_cost} ค่าคนขับ ${t.total_driver_cost} อื่น ${t.total_other_cost}+${t.total_extra_expenses}`
      + ` | กำไร dashboard ${t.net_profit} | ค่าประจำ ${t.total_fixed_expenses} | รายงาน ${t.net_after_fixed} | เที่ยว ${t.trip_count}`);
  }
}
