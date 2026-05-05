import { BUDDHIST_ERA_OFFSET, THAI_MONTHS, THAI_MONTHS_SHORT, ROUND_DOWN_TO } from './constants';
import type { MonthFilter, TripTotals, Trip } from '@/types';

// ─── ปัดลง (ห้ามปัดขึ้น) ────────────────────────────────────
export function floorToNearest10(value: number): number {
  return Math.floor(value / ROUND_DOWN_TO) * ROUND_DOWN_TO;
}

// ─── แปลง AD → พ.ศ. ────────────────────────────────────────
export function adToBE(year: number): number {
  return year + BUDDHIST_ERA_OFFSET;
}

export function beTOAD(year: number): number {
  return year - BUDDHIST_ERA_OFFSET;
}

// ─── Thai date display ──────────────────────────────────────
export function formatThaiDate(dateStr: string, short = false): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  const day  = date.getDate();
  const mon  = short ? THAI_MONTHS_SHORT[date.getMonth()] : THAI_MONTHS[date.getMonth()];
  const year = adToBE(date.getFullYear());
  return short ? `${day} ${mon} ${String(year).slice(2)}` : `${day} ${mon} ${year}`;
}

// ─── Month filter helpers ───────────────────────────────────
export function getCurrentMonthFilter(): MonthFilter {
  const now = new Date();
  return {
    month_index: now.getMonth(),
    year_be:     adToBE(now.getFullYear()),
  };
}

export function isDateInFilter(dateStr: string, filter: MonthFilter): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr + 'T00:00:00');
  return (
    date.getMonth()     === filter.month_index &&
    date.getFullYear()  === beTOAD(filter.year_be)
  );
}

export function getThaiMonthLabel(filter: MonthFilter): string {
  return `${THAI_MONTHS[filter.month_index]} ${filter.year_be}`;
}

// ─── Format currency ────────────────────────────────────────
export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(num: number, decimals = 0): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

// ─── Trip totals ────────────────────────────────────────────
export function calculateTotals(trips: Trip[]): TripTotals {
  return trips.reduce<TripTotals>(
    (acc, t) => ({
      trips:           acc.trips + 1,
      transport_price: acc.transport_price + (t.transport_price || 0),
      trip_pay:        acc.trip_pay        + (t.trip_pay        || 0),
      fuel_cost:       acc.fuel_cost       + (t.fuel_cost       || 0),
      fuel_litres:     acc.fuel_litres     + (t.fuel_litres     || 0),
      other_cost:      acc.other_cost      + (t.other_cost      || 0),
      withdraw:        acc.withdraw        + (t.withdraw        || 0),
      distance:        acc.distance        + (t.distance        || 0),
    }),
    { trips: 0, transport_price: 0, trip_pay: 0, fuel_cost: 0, fuel_litres: 0, other_cost: 0, withdraw: 0, distance: 0 }
  );
}

// ─── Fuel efficiency ────────────────────────────────────────
export function calcFuelEfficiency(distance: number, litres: number): number {
  if (litres <= 0) return 0;
  return parseFloat((distance / litres).toFixed(2));
}

// ─── Commission ─────────────────────────────────────────────
export function calcCommission(transportPrice: number, rate = 0.10): number {
  return parseFloat((transportPrice * rate).toFixed(2));
}

// ─── Net payroll ────────────────────────────────────────────
export function calcNetPay(
  tripPay: number,
  salary: number,
  withdraw: number,
  socialSecurity: number,
): number {
  return floorToNearest10(tripPay + salary - withdraw - socialSecurity);
}

// ─── Distance ───────────────────────────────────────────────
export function calcDistance(start: number, end: number): number {
  return Math.max(0, end - start);
}

// ─── Image compression ──────────────────────────────────────
export function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale  = maxWidth / img.width;
        canvas.width  = maxWidth;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context error')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// ─── CSV helpers ────────────────────────────────────────────
export function escapeCsvField(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Clamp / safe number ────────────────────────────────────
export function safeNumber(value: number | '' | null | undefined): number {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}
