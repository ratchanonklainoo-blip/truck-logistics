// ตรวจก่อนบันทึกเที่ยววิ่ง (ฟังก์ชันบริสุทธิ์) — ใช้โดย TripForm และ scripts/test-formula.mts
// กันบันทึก 1 เที่ยวเป็น 2 แถว (เคส 11 แถว พ.ค. 2026), เลขไมล์ซ้ำ/ถอยหลัง, ค่าขนส่งกับค่าเที่ยวไม่สอดคล้องกัน
import { isRealTrip } from './tripCount';
import { normalizePlate } from './monthlyReport';

export interface CheckTrip {
  id?: string;
  date: string;
  driver_id: string;
  origin?: string | null;
  destination?: string | null;
  plate?: string | null;
  odometer_start?: number | string | null;
  odometer_end?: number | string | null;
  transport_price?: number | string | null;
  trip_pay?: number | string | null;
  created_at?: string | null;
  /** ทะเบียนของคนขับ (ใช้เมื่อเที่ยวไม่มี plate) */
  driver_plate?: string | null;
}

const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
const place = (s?: string | null) => (s ?? '').trim().toLowerCase();
const num = (v: unknown) => Number(v) || 0;

/** ทะเบียนที่ใช้จริงของเที่ยว: trips.plate ถ้ามี ไม่มีใช้ทะเบียนคนขับ (ตัดตัวอักษรไทย/ช่องว่างให้เทียบกันได้) */
export function vehicleKey(t: CheckTrip): string {
  return normalizePlate((t.plate || '').trim() || t.driver_plate || '');
}

/** รถคันเดียวกัน: ทะเบียนเดียวกัน (ถ้ามี) หรือคนขับเดียวกัน */
export function sameVehicle(a: CheckTrip, b: CheckTrip): boolean {
  const ka = vehicleKey(a), kb = vehicleKey(b);
  if (ka && kb) return ka === kb;
  return a.driver_id === b.driver_id;
}

/** เที่ยวที่น่าจะซ้ำ: วันเดียวกัน ±1 วัน + รถ/ทะเบียนเดียวกัน + ต้นทาง/ปลายทางเดียวกัน (เฉพาะเที่ยวจริง ไม่ใช่แถว '-'→'-') */
export function findDuplicateTrips<T extends CheckTrip>(trip: CheckTrip, others: T[]): T[] {
  if (!isRealTrip(trip) || !trip.date) return [];
  const d = dayNo(trip.date);
  return others.filter(o =>
    o.id !== trip.id && !!o.date && Math.abs(dayNo(o.date) - d) <= 1 && sameVehicle(trip, o)
    && place(o.origin) === place(trip.origin) && place(o.destination) === place(trip.destination));
}

/** เตือนเลขไมล์: ซ้ำกับเที่ยวอื่นของรถคันเดียวกัน หรือไมล์ต้นน้อยกว่าไมล์ปลายของเที่ยวล่าสุดก่อนหน้า (ถอยหลัง) */
export function odometerWarnings(trip: CheckTrip, others: CheckTrip[]): string[] {
  const start = num(trip.odometer_start), end = num(trip.odometer_end);
  const same = others.filter(o => o.id !== trip.id && sameVehicle(trip, o));
  const warns: string[] = [];
  if (start > 0 && end > 0 && end < start) warns.push(`ไมล์ปลาย (${end.toLocaleString()}) น้อยกว่าไมล์ต้น (${start.toLocaleString()})`);
  for (const o of same) {
    const os = num(o.odometer_start), oe = num(o.odometer_end);
    if ((start > 0 && (start === os || start === oe)) || (end > 0 && (end === os || end === oe))) {
      warns.push(`เลขไมล์ซ้ำกับเที่ยววันที่ ${o.date} (${o.origin || '-'} → ${o.destination || '-'} ไมล์ ${os.toLocaleString()}–${oe.toLocaleString()})`);
    }
  }
  if (start > 0) {
    const prior = same
      .filter(o => num(o.odometer_end) > 0 && o.date <= trip.date)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''))[0];
    if (prior && start < num(prior.odometer_end)) {
      warns.push(`ไมล์ต้น ${start.toLocaleString()} น้อยกว่าไมล์ปลายของเที่ยวล่าสุดของรถคันนี้ (${prior.date}: ${num(prior.odometer_end).toLocaleString()}) — ไมล์ถอยหลัง`);
    }
  }
  return Array.from(new Set(warns));
}

/** ค่าขนส่ง 0 แต่ค่าเที่ยว > 0 หรือกลับกัน (เฉพาะเที่ยวจริง) → ต้องติ๊กยืนยัน */
export function payMismatch(trip: CheckTrip): 'no_price' | 'no_pay' | null {
  if (!isRealTrip(trip)) return null;
  const price = num(trip.transport_price), pay = num(trip.trip_pay);
  if (price === 0 && pay > 0) return 'no_price';
  if (price > 0 && pay === 0) return 'no_pay';
  return null;
}
