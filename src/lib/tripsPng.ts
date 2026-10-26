// Export PNG ของตารางรายการเที่ยว (หน้า /trips) — วาดด้วย canvas 2D ของเบราว์เซอร์ ไม่ใช้ dependency เพิ่ม
// ใช้ข้อมูลชุดเดียวกับตาราง/Export CSV (tableTrips + tableTotals) ; ตัวเลขแต่ละแถวแสดงแบบเดียวกับ TripTable
// หน่วยความจำมือถือ: รูปละไม่เกิน PNG_ROWS_PER_PAGE แถว วาดทีละรูปแล้วคืน canvas ก่อนวาดรูปถัดไป
//   ขนาดรูป ≈ 1620 x 2500 px (≈ 4 ล้านพิกเซล ~16 MB ขณะวาด) ต่ำกว่าเพดาน canvas ของ iOS Safari (16.7 ล้านพิกเซล)
import type { Trip, TripTotals } from '@/types';
import { formatThaiDate, formatNumber } from '@/lib/utils';

export const PNG_ROWS_PER_PAGE = 30;
export const PNG_MAX_PAGES     = 10; // เกินนี้ (300 รายการ) ให้ผู้ใช้กรองช่วงวันที่ให้แคบลงก่อน
const SCALE = 1.5;

export interface TripsPngMeta {
  companyName: string;
  driverName:  string;
  plate:       string;
  periodText:  string; // เดือนที่เลือก หรือข้อความช่วงวันที่ขึ้น/ลงที่กรองอยู่
}

export function pngPageCount(rows: number): number {
  return Math.max(1, Math.ceil(rows / PNG_ROWS_PER_PAGE));
}

// Sarabun โหลดจาก Google Fonts ใน layout ; ถ้าโหลดไม่ทัน/ออฟไลน์ ใช้ฟอนต์ไทยของเครื่อง (Android: Noto Sans Thai, iOS: Thonburi, Windows: Tahoma)
const FONT = `'Sarabun', 'Noto Sans Thai', Thonburi, Tahoma, sans-serif`;
const font = (px: number, weight = 400) => `${weight} ${px}px ${FONT}`;

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const load = Promise.all([400, 600, 700].map(w => document.fonts.load(`${w} 16px Sarabun`, 'กขคเที่ยว'))).catch(() => undefined);
  await Promise.race([load, new Promise(r => setTimeout(r, 3000))]);
}

// ── layout (หน่วย CSS px ก่อนคูณ SCALE) ─────────────────────
const W = 1080, PAD = 24, HEAD_H = 132, COL_H = 36, ROW_H = 46, TOTAL_H = 44, FOOT_H = 36;
type Align = 'left' | 'center' | 'right';
const COLS: { label: string; w: number; align: Align }[] = [
  { label: 'วันที่',           w: 150, align: 'left'   },
  { label: 'สินค้า / เส้นทาง', w: 280, align: 'left'   },
  { label: 'ไมล์ต้น/ปลาย',     w: 160, align: 'center' },
  { label: 'ค่าน้ำมัน',         w: 88,  align: 'right'  },
  { label: 'ค่าขนส่ง',          w: 88,  align: 'right'  },
  { label: 'ค่าเที่ยว',         w: 88,  align: 'right'  },
  { label: 'เบิก',             w: 88,  align: 'right'  },
  { label: 'อื่นๆ',             w: 90,  align: 'right'  },
];
const NUM_COLORS = ['#2563eb', '#9333ea', '#16a34a', '#ef4444', '#64748b']; // ตามสีคอลัมน์ใน TripTable

const money = (n: number) => (n > 0 ? formatNumber(n) : '-');

// ตัดข้อความให้พอดีความกว้าง ตัดทีละ grapheme เพื่อไม่ให้สระ/วรรณยุกต์ไทยหลุดจากพยัญชนะ
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text), s => s.segment)
    : Array.from(text);
  let lo = 0, hi = seg.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(seg.slice(0, mid).join('') + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return seg.slice(0, lo).join('') + '…';
}

function cellText(ctx: CanvasRenderingContext2D, text: string, x: number, w: number, y: number, align: Align) {
  const t = fit(ctx, text, w - 16);
  ctx.textAlign = align;
  ctx.fillText(t, align === 'left' ? x + 8 : align === 'right' ? x + w - 8 : x + w / 2, y);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('เบราว์เซอร์สร้างไฟล์ PNG ไม่ได้'))), 'image/png'));
}

/** วาดรูปที่ page (เริ่ม 0) ; แถวรวมท้ายตารางอยู่เฉพาะรูปสุดท้าย */
export async function renderTripsPngPage(
  trips: Trip[], totals: TripTotals, meta: TripsPngMeta, page: number, printedAt = new Date(),
): Promise<Blob> {
  await ensureFonts();
  const pages = pngPageCount(trips.length);
  const rows  = trips.slice(page * PNG_ROWS_PER_PAGE, (page + 1) * PNG_ROWS_PER_PAGE);
  const last  = page === pages - 1;
  const H = HEAD_H + COL_H + rows.length * ROW_H + (last ? TOTAL_H : 0) + FOOT_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการวาดรูป');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── หัวรายงาน ──
  ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left';
  ctx.font = font(22, 700); ctx.fillText(meta.companyName, PAD, 30);
  ctx.font = font(18, 600); ctx.fillText(fit(ctx, `รายการเที่ยววิ่ง — ${meta.driverName}`, W - PAD * 2), PAD, 62);
  ctx.fillStyle = '#334155'; ctx.font = font(15);
  ctx.fillText(fit(ctx, `ช่วง: ${meta.periodText}   ·   ทะเบียน: ${meta.plate || '—'}`, W - PAD * 2), PAD, 90);
  const from = page * PNG_ROWS_PER_PAGE + 1, to = page * PNG_ROWS_PER_PAGE + rows.length;
  ctx.fillText(`${formatNumber(trips.length)} รายการ${pages > 1 ? `  ·  รูปที่ ${page + 1}/${pages} (รายการที่ ${from}–${to})` : ''}`, PAD, 114);

  // ── หัวคอลัมน์ ──
  const tableW = COLS.reduce((s, c) => s + c.w, 0);
  let y = HEAD_H;
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(PAD, y, tableW, COL_H);
  ctx.fillStyle = '#475569'; ctx.font = font(13, 600);
  let x = PAD;
  for (const c of COLS) { cellText(ctx, c.label, x, c.w, y + COL_H / 2, c.align); x += c.w; }
  y += COL_H;

  // ── แถวรายการ ──
  rows.forEach((t, i) => {
    if (i % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(PAD, y, tableW, ROW_H); }
    // วันขึ้น/ลงปีเดียวกับวันที่เที่ยว ตัดปีออกให้พอดีคอลัมน์ ("ขึ้น 13 ต.ค. · ลง 15 ต.ค.")
    const dm = (d: string) => (d.slice(0, 4) === t.date.slice(0, 4) ? formatThaiDate(d, true).replace(/ \d{2}$/, '') : formatThaiDate(d, true));
    const sub = [t.load_date && `ขึ้น ${dm(t.load_date)}`, t.unload_date && `ลง ${dm(t.unload_date)}`]
      .filter(Boolean).join(' · ');
    const route = `${t.origin || ''} → ${t.destination || ''}`;
    x = PAD;
    const c0 = COLS[0], c1 = COLS[1], c2 = COLS[2];
    ctx.fillStyle = '#0f172a'; ctx.font = font(14, 600);
    cellText(ctx, formatThaiDate(t.date, true), x, c0.w, y + (sub ? 15 : ROW_H / 2), 'left');
    if (sub) { ctx.fillStyle = '#475569'; ctx.font = font(11); cellText(ctx, sub, x, c0.w, y + 33, 'left'); }
    x += c0.w;
    ctx.fillStyle = '#1e293b'; ctx.font = font(14, 600); cellText(ctx, t.product || '-', x, c1.w, y + 15, 'left');
    ctx.fillStyle = '#64748b'; ctx.font = font(12);       cellText(ctx, route, x, c1.w, y + 33, 'left');
    x += c1.w;
    ctx.fillStyle = '#64748b'; ctx.font = font(13);
    cellText(ctx, `${formatNumber(t.odometer_start)} / ${formatNumber(t.odometer_end)}`, x, c2.w, y + ROW_H / 2, 'center');
    x += c2.w;
    [t.fuel_cost, t.transport_price, t.trip_pay, t.withdraw, t.other_cost].forEach((v, k) => {
      ctx.fillStyle = NUM_COLORS[k]; ctx.font = font(14, k === 4 ? 400 : 600);
      cellText(ctx, money(v), x, COLS[3 + k].w, y + ROW_H / 2, 'right');
      x += COLS[3 + k].w;
    });
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y + ROW_H - 0.5); ctx.lineTo(PAD + tableW, y + ROW_H - 0.5); ctx.stroke();
    y += ROW_H;
  });

  // ── แถวรวม (ทั้งชุด ไม่ใช่เฉพาะรูปนี้) — ตัวเลขเดียวกับ tfoot ของ TripTable ──
  if (last) {
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(PAD, y, tableW, TOTAL_H);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(PAD, y, tableW, 2);
    ctx.fillStyle = '#1e293b'; ctx.font = font(14, 700);
    const w3 = COLS[0].w + COLS[1].w + COLS[2].w;
    cellText(ctx, `รวม ${formatNumber(totals.trips)} เที่ยว | ${formatNumber(totals.distance)} กม.`, PAD, w3, y + TOTAL_H / 2, 'right');
    x = PAD + w3;
    [totals.fuel_cost, totals.transport_price, totals.trip_pay, totals.withdraw].forEach((v, k) => {
      ctx.fillStyle = NUM_COLORS[k]; cellText(ctx, formatNumber(v), x, COLS[3 + k].w, y + TOTAL_H / 2, 'right'); x += COLS[3 + k].w;
    });
    ctx.fillStyle = NUM_COLORS[4]; cellText(ctx, money(totals.other_cost), x, COLS[7].w, y + TOTAL_H / 2, 'right');
    y += TOTAL_H;
  }

  // ── ท้ายรูป ──
  ctx.fillStyle = '#94a3b8'; ctx.font = font(12); ctx.textAlign = 'right';
  ctx.fillText(`ออกรายงาน ${printedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}`,
    PAD + tableW, y + FOOT_H / 2 + 4);

  try { return await toBlob(canvas); }
  finally { canvas.width = 0; canvas.height = 0; } // คืนหน่วยความจำ canvas ทันที (สำคัญบน iOS)
}

/** วาดและดาวน์โหลดทีละรูป (ไม่ถือทุกรูปไว้ในหน่วยความจำพร้อมกัน) ; fileBase ไม่รวมนามสกุล */
export async function exportTripsPng(trips: Trip[], totals: TripTotals, meta: TripsPngMeta, fileBase: string): Promise<number> {
  const pages = pngPageCount(trips.length);
  const printedAt = new Date();
  for (let p = 0; p < pages; p++) {
    const blob = await renderTripsPngPage(trips, totals, meta, p, printedAt);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pages > 1 ? `${fileBase}_${p + 1}of${pages}.png` : `${fileBase}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    if (p < pages - 1) await new Promise(r => setTimeout(r, 600)); // เว้นจังหวะให้เบราว์เซอร์รับดาวน์โหลดทีละไฟล์
  }
  return pages;
}
