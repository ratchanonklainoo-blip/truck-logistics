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
  fuel_cost?: number | string | null;
  fuel_litres?: number | string | null;
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

/** เตือนเลขไมล์: ซ้ำกับเที่ยวอื่นของรถคันเดียวกัน หรือไมล์ต้นน้อยกว่าไมล์ปลายของเที่ยวล่าสุดก่อนหน้า (ถอยหลัง)
 *  ซ้ำ = ไมล์ต้นและไมล์ปลายตรงกันทั้งคู่ และ (มีระยะทาง หรือเที่ยว 0 กม. วันเดียวกัน+เส้นทางเดียวกัน)
 *  ไมล์ต้น = ไมล์ปลายเที่ยวก่อน คือเที่ยวต่อเนื่องปกติ ไม่เตือน */
export function odometerWarnings(trip: CheckTrip, others: CheckTrip[]): string[] {
  const start = num(trip.odometer_start), end = num(trip.odometer_end);
  const same = others.filter(o => o.id !== trip.id && sameVehicle(trip, o));
  const warns: string[] = [];
  if (start > 0 && end > 0 && end < start) warns.push(`ไมล์ปลาย (${end.toLocaleString()}) น้อยกว่าไมล์ต้น (${start.toLocaleString()})`);
  for (const o of same) {
    const os = num(o.odometer_start), oe = num(o.odometer_end);
    const bothMatch = start > 0 && end > 0 && start === os && end === oe;
    const sameDayRoute = o.date === trip.date
      && place(o.origin) === place(trip.origin) && place(o.destination) === place(trip.destination);
    if (bothMatch && (end > start || sameDayRoute)) {
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

/** W1 (เตือนขณะกรอก): แถวมีน้ำมันหรือมีระยะไมล์ แต่ต้นทาง-ปลายทางว่าง/'-' ทั้งคู่ → อาจลืมใส่เส้นทาง (ไม่บล็อก) */
export function missingRouteWarning(trip: CheckTrip): string | null {
  if (isRealTrip(trip)) return null;
  const fuel = num(trip.fuel_cost) > 0 || num(trip.fuel_litres) > 0;
  const km = num(trip.odometer_end) > num(trip.odometer_start);
  if (!fuel && !km) return null;
  return `แถวนี้มี${fuel && km ? 'น้ำมันและไมล์' : fuel ? 'น้ำมัน' : 'ไมล์'}แต่ไม่มีต้นทาง-ปลายทาง — ถ้าเป็นของเที่ยววิ่ง ให้ใส่ต้นทาง-ปลายทาง หรือลงไว้ที่แถวเที่ยวนั้น (ถ้าเป็นวิ่งเปล่า/เติมน้ำมันอย่างเดียว บันทึกต่อได้)`;
}

/** W2 (กล่องตรวจก่อนบันทึก): เที่ยวไมล์ 0 แต่ไมล์ต้นตรงกับไมล์ต้นของแถว '-' ที่มีน้ำมันและมีระยะ ของรถคันเดียวกันภายใน ±3 วัน
 *  → ไมล์/น้ำมันของเที่ยวนี้น่าจะไปลงที่แถว '-' (เช่น 30 ส.ค. 2026 พิษณุโลก→ลำพูน กับแถว '-' 31 ส.ค.) */
export function zeroKmFuelElsewhereWarnings(trip: CheckTrip, others: CheckTrip[]): string[] {
  const start = num(trip.odometer_start), end = num(trip.odometer_end);
  if (!isRealTrip(trip) || !trip.date || start <= 0 || (end !== 0 && end !== start)) return [];
  const d = dayNo(trip.date);
  return others
    .filter(o => o.id !== trip.id && !isRealTrip(o) && !!o.date && Math.abs(dayNo(o.date) - d) <= 3 && sameVehicle(trip, o)
      && num(o.fuel_cost) > 0 && num(o.odometer_start) === start && num(o.odometer_end) > start)
    .map(o => `เที่ยวนี้ไมล์ 0 แต่ไมล์ต้น ${start.toLocaleString()} ตรงกับแถว '-' วันที่ ${o.date} (ไมล์ ${num(o.odometer_start).toLocaleString()}–${num(o.odometer_end).toLocaleString()} น้ำมัน ${num(o.fuel_cost).toLocaleString()} บาท) — ถ้าไมล์/น้ำมันแถวนั้นเป็นของเที่ยวนี้ ให้ย้ายมาลงที่เที่ยวนี้`);
}
