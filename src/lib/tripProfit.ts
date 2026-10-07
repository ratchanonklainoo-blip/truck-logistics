// กำไรรายเที่ยว / รายวัน (ฟังก์ชันบริสุทธิ์ อ่านอย่างเดียว) — ใช้โดย /api/reports/trip-profit และ scripts/test-trip-profit.mts
// ออกแบบ: DESIGN_TRIP_PROFIT_dev1.md (CEO อนุมัติ 2026-10) — ไม่แก้สูตรเดิม ไม่เขียน DB
//
// กติกา:
//  - รถ = ทะเบียนของเที่ยว (trips.plate) ไม่มีใช้ทะเบียนคนขับ ; ทะเบียนคู่ทั้งก้อนเป็นรถคันเดียว
//  - เที่ยวจริง = isRealTrip (กติกาเดียวกับการนับเที่ยวทั้งระบบ) ; แถวอื่น = วิ่งเปล่า (มีไมล์) / ไม่ได้วิ่ง (ซ่อม/เบิก)
//  - ค่าน้ำมันของรถ/วัน = Σ trips.fuel_cost ทุกแถวของรถคันนั้นวันนั้น (ไม่ยกข้ามวัน) กระจายให้เที่ยวจริงตามระยะทาง
//    · เที่ยวไมล์ 0 ที่เลขไมล์อยู่ในช่วงของเที่ยวที่มีไมล์ = รอบน้ำมันเดียวกัน → เที่ยวที่มีไมล์รับน้ำมันของกลุ่มทั้งก้อน เที่ยวไมล์ 0 ได้ 0
//    · วันมีน้ำมันไม่มีเที่ยว → เป็นต้นทุนของวันนั้นเอง (ไม่ลงเที่ยวใด) ; ถ้าเป็นแถว '-' ที่ไมล์เริ่มตรงกับเที่ยวไมล์ 0
//      ภายใน 3 วันก่อนหน้า ขึ้นป้ายเตือนอย่างเดียว ไม่ย้ายตัวเลข (CEO อนุมัติ 2026-10-07)
//    · วันมีเที่ยวไม่มีน้ำมัน → ประมาณการจากต้นทุนน้ำมัน/กม. ของรถคันนั้นย้อนหลัง 30 วัน (ป้าย "ประมาณการ" เฉพาะรายเที่ยว)
//  - ต้นทุนเที่ยว = น้ำมันจัดสรร + ค่าเที่ยว (trip_pay) ; ไม่รวม other_cost (แสดงเป็น "ค่าใช้จ่ายอื่นของเดือน")
//  - กำไรเที่ยว = ค่าขนส่ง − ต้นทุนเที่ยว
//  - สรุปรายวัน/รายคัน (ทุกแถวของวัน): ต้นทุนวัน = น้ำมันที่เติมวันนั้น + ค่าเที่ยว ; กำไรวัน = รายได้ − ต้นทุนวัน
//    ต้นทุน/กม. = ต้นทุนวัน ÷ กม. ที่วิ่งจริงของวัน (รวมวิ่งเปล่า) ; ไม่ใช้น้ำมันประมาณการ
import { isRealTrip } from './tripCount';
import { normalizePlate } from './monthlyReport';
import { tripPayOf, isCountedDriver, type EmploymentLike } from './payrollCalc';

export interface TPDriver extends EmploymentLike {
  id: string; name: string; nickname: string; license_plate: string | null;
}
export interface TPRow {
  id: string; date: string; driver_id: string;
  origin: string | null; destination: string | null; product: string | null;
  plate?: string | null;
  odometer_start: number | null; odometer_end: number | null;
  transport_price: number | null; trip_pay: number | null;
  fuel_cost: number | null; fuel_litres: number | null;
  other_cost: number | null; other_item?: string | null; remarks?: string | null;
  receipt_image_url?: string | null;
  created_at?: string | null;
  drivers: TPDriver | null;
}

export type RowKind = 'trip' | 'empty_run' | 'not_run';
export type FuelMode = 'actual' | 'estimate' | 'no_data';
export type ProfitColor = 'green' | 'yellow' | 'red';

export interface TPTrip {
  id: string; date: string; vehicle: string; plate_label: string;
  driver_id: string; driver_name: string;
  round: number; product: string; origin: string; destination: string;
  km: number | null;               // ระยะของเที่ยวนี้ (null = ไม่ทราบระยะทาง)
  group_host: number | null;       // รอบที่ของเที่ยวที่มีไมล์ซึ่งเที่ยวนี้รวมไมล์อยู่ด้วย
  group_size: number;              // เที่ยวหลักของกลุ่ม: จำนวนเที่ยวที่ใช้ไมล์ร่วมกัน (1 = เที่ยวเดี่ยว)
  fuel: number; litres: number; fuel_mode: FuelMode;
  pay: number; cost: number; revenue: number; profit: number;
  cost_per_km: number | null; profit_per_km: number | null; min_price: number | null;
  color: ProfitColor;
  receipt_image_url: string | null;
}

export interface TPFuelHint {
  row_id: string; amount: number;  // แถว '-' ที่มีน้ำมัน
  trip_id: string; trip_date: string; route: string; // เที่ยวไมล์ 0 ที่ไมล์ตรงกัน
}

export interface TPDay {
  vehicle: string; plate_label: string; date: string; drivers: string[];
  trip_count: number;
  km: number;                      // กม. ที่วิ่งจริงของวัน (ทุกแถว รวมวิ่งเปล่า)
  fuel_own: number; litres_own: number;
  fills: number;                   // จำนวนครั้งที่เติม (แถวที่มีค่าน้ำมัน)
  fuel_no_trip: number;            // วันไม่มีเที่ยว: น้ำมันที่ไม่ได้ลงเที่ยวใด
  fuel_estimated: number; est_rate: number | null; // น้ำมันประมาณการของเที่ยวในวันนี้ (เฉพาะรายเที่ยว ไม่นับในต้นทุนวัน)
  pay: number; cost: number; revenue: number; profit: number; // ทุกแถวของวัน: cost = fuel_own + pay
  cost_per_km: number | null;
  off_trip: { rows: number; km: number; other: number; pay: number; revenue: number };
  hints: TPFuelHint[];
}

export interface TPOtherExpense {
  id: string; date: string; vehicle: string; plate_label: string; driver_name: string;
  item: string; remarks: string; route: string | null; amount: number;
}

export interface TPTotals {
  trip_count: number; km: number; unknown_km_trips: number; no_data_trips: number;
  litres: number; fuel_actual: number; fuel_estimated: number;
  pay: number; cost: number; revenue: number; profit: number;
  cost_per_km: number | null; profit_per_km: number | null;
  other_expenses: number; profit_after_other: number;
  off_trip_revenue: number; off_trip_pay: number;
  fuel_no_trip: number;            // น้ำมันของวันที่ไม่มีเที่ยว (ไม่ได้ลงเที่ยวใด)
}

export interface TripProfitResult {
  from: string; to: string; margin: number;
  trips: TPTrip[]; days: TPDay[]; other_expenses: TPOtherExpense[]; totals: TPTotals;
}

const num = (v: unknown) => Number(v) || 0;
const toS = (n: number) => Math.round(n * 100);            // บาท → สตางค์
const fromS = (s: number) => s / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => { const s = (v ?? '').trim(); return s === '' || s === '-'; };

/** ทะเบียนรถเป็นคีย์ (ทะเบียนคู่ทั้งก้อน) — รูปย่อ 71-1831/1832 เติมหมวดให้ส่วนที่ 2 → 71-1831-71-1832 */
export function vehicleKey(plate: string | null | undefined): string {
  const n = normalizePlate(plate);
  const m = n.match(/^(\d{1,3})-(\d{4})-(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[1]}-${m[3]}` : n;
}

export function hasKm(t: Pick<TPRow, 'odometer_start' | 'odometer_end'>): boolean {
  return num(t.odometer_start) > 0 && num(t.odometer_end) > num(t.odometer_start);
}
const kmOf = (t: TPRow) => (hasKm(t) ? num(t.odometer_end) - num(t.odometer_start) : 0);

export function classifyRow(t: Pick<TPRow, 'origin' | 'destination' | 'odometer_start' | 'odometer_end'>): RowKind {
  if (isRealTrip(t)) return 'trip';
  return hasKm(t) ? 'empty_run' : 'not_run';
}

/** กระจาย total (หน่วยย่อย) ตามน้ำหนัก แบบ largest remainder — ผลรวมตรงทุกหน่วย */
export function splitByWeight(total: number, weights: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / W);
  const fl = raw.map(Math.floor);
  let rem = total - fl.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - fl[i], i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => { if (rem-- > 0) fl[i]++; });
  return fl;
}

export function profitColor(profit: number, revenue: number): ProfitColor {
  if (profit < 0 || revenue <= 0) return 'red';
  return profit < revenue * 0.1 ? 'yellow' : 'green';
}

const addDays = (d: string, n: number) =>
  new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);

export interface TripProfitOptions {
  from: string; to: string;        // ช่วงที่แสดง (YYYY-MM-DD) — rows ควรมีข้อมูลย้อนก่อน from (แนะนำ 60 วัน) เพื่อประมาณการ/ป้ายเตือน
  margin?: number;                 // กำไรขั้นต่ำ (0.10 = 10%)
  estDays?: number;                // ย้อนหลังกี่วันสำหรับอัตราประมาณการ (30)
  estMinKm?: number;               // ถ้าช่วงย้อนหลังมี กม. น้อยกว่านี้ ใช้ 10 วันที่มีข้อมูลล่าสุดแทน (1000)
}

/** คำนวณกำไรรายเที่ยว/รายวันของช่วง [from, to] */
export function buildTripProfit(rows: TPRow[], opts: TripProfitOptions): TripProfitResult {
  const { from, to } = opts;
  const margin = opts.margin ?? 0.1, estDays = opts.estDays ?? 30, estMinKm = opts.estMinKm ?? 1000;
  const inRange = (d: string) => d >= from && d <= to;

  const counted = rows.filter(t => t.drivers && isCountedDriver(t.drivers) && t.date <= to);
  const byVehicle = new Map<string, TPRow[]>();
  for (const t of counted) {
    const label = (t.plate || '').trim() || t.drivers!.license_plate || '';
    const k = vehicleKey(label);
    if (!byVehicle.has(k)) byVehicle.set(k, []);
    byVehicle.get(k)!.push(t);
  }

  const trips: TPTrip[] = [], days: TPDay[] = [];

  for (const [vehicle, vrows] of Array.from(byVehicle.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const plateLabel = (vrows[0].plate || '').trim() || vrows[0].drivers!.license_plate || vehicle;
    const byDay = new Map<string, TPRow[]>();
    for (const t of vrows) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date)!.push(t); }

    const hist: { date: string; fuelS: number; km: number }[] = [];
    const zeroKmTrips = vrows.filter(t => classifyRow(t) === 'trip' && !hasKm(t) && num(t.odometer_start) > 0);

    for (const date of Array.from(byDay.keys()).sort()) {
      const r = byDay.get(date)!.sort((a, b) =>
        num(a.odometer_start) - num(b.odometer_start) || (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
      const T = r.filter(t => classifyRow(t) === 'trip');
      const O = r.filter(t => classifyRow(t) !== 'trip');
      const ownS = r.reduce((a, t) => a + toS(num(t.fuel_cost)), 0);
      const ownMl = r.reduce((a, t) => a + Math.round(num(t.fuel_litres) * 1000), 0);
      const allKm = r.reduce((a, t) => a + kmOf(t), 0);
      const payS = r.reduce((a, t) => a + toS(tripPayOf(t)), 0);
      const revS = r.reduce((a, t) => a + toS(num(t.transport_price)), 0);
      const day: TPDay = {
        vehicle, plate_label: plateLabel, date,
        drivers: Array.from(new Set(r.map(t => t.drivers!.nickname || t.drivers!.name))),
        trip_count: T.length, km: allKm,
        fuel_own: fromS(ownS), litres_own: ownMl / 1000,
        fills: r.filter(t => num(t.fuel_cost) !== 0).length,
        fuel_no_trip: T.length === 0 ? fromS(ownS) : 0,
        fuel_estimated: 0, est_rate: null,
        pay: fromS(payS), cost: fromS(ownS + payS), revenue: fromS(revS), profit: fromS(revS - ownS - payS),
        cost_per_km: allKm > 0 ? r2(fromS(ownS + payS) / allKm) : null,
        off_trip: {
          rows: O.length, km: O.reduce((a, t) => a + kmOf(t), 0),
          other: r2(O.reduce((a, t) => a + num(t.other_cost), 0)),
          pay: r2(O.reduce((a, t) => a + tripPayOf(t), 0)),
          revenue: r2(O.reduce((a, t) => a + num(t.transport_price), 0)),
        },
        // ป้ายเตือน: แถว '-' มีน้ำมัน + ไมล์เริ่มตรงกับเที่ยวไมล์ 0 ภายใน 3 วันก่อนหน้า (ไม่ย้ายตัวเลข)
        hints: O.filter(t => num(t.fuel_cost) !== 0 && num(t.odometer_start) > 0).flatMap(t => {
          const z = zeroKmTrips.filter(p => p.date < date && p.date >= addDays(date, -3) && num(p.odometer_start) === num(t.odometer_start))
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          return z ? [{
            row_id: t.id, amount: num(t.fuel_cost), trip_id: z.id, trip_date: z.date,
            route: `${(z.origin || '').trim() || '-'} → ${(z.destination || '').trim() || '-'}`,
          }] : [];
        }),
      };

      if (T.length === 0) { // วันมีน้ำมันไม่มีเที่ยว → ต้นทุนของวันนั้นเอง ไม่ยกไปเที่ยวถัดไป
        if (ownS || allKm) hist.push({ date, fuelS: ownS, km: allKm });
        if (inRange(date)) days.push(day);
        continue;
      }

      const poolS = ownS, poolMl = ownMl;

      // ระยะทาง + กลุ่มไมล์
      const info = T.map((t, i) => ({ t, i, km: hasKm(t) ? kmOf(t) : null as number | null, grp: i }));
      for (const x of info) if (x.km == null) {
        const v = num(x.t.odometer_start) || num(x.t.odometer_end);
        const host = info.find(y => y.km != null && v >= num(y.t.odometer_start) && v <= num(y.t.odometer_end));
        if (host) x.grp = host.i;
      }
      const groups = new Map<number, typeof info>();
      for (const x of info) { if (!groups.has(x.grp)) groups.set(x.grp, []); groups.get(x.grp)!.push(x); }
      const gKeys = Array.from(groups.keys());
      const gKm = gKeys.map(k => groups.get(k)!.reduce((a, x) => a + (x.km || 0), 0));
      const knownKm = gKm.reduce((a, b) => a + b, 0);

      const fuelS = info.map(() => 0), ml = info.map(() => 0);
      const mode: FuelMode[] = info.map(() => 'actual');
      // ในกลุ่มไมล์: เที่ยวที่มีไมล์ (เที่ยวหลัก) รับทั้งก้อน เที่ยวไมล์ 0 ได้ 0 ; กลุ่มเดี่ยวไม่ทราบระยะ = รับเอง
      const hostW = (m: typeof info) => m.map(x => (x.km != null || m.length === 1 ? 1 : 0));
      const spreadInGroups = (totS: number, totMl: number, weights: number[]) => {
        const gS = splitByWeight(totS, weights), gMl = splitByWeight(totMl, weights);
        gKeys.forEach((k, j) => {
          const m = groups.get(k)!;
          const sub = splitByWeight(gS[j], hostW(m)), subMl = splitByWeight(gMl[j], hostW(m));
          m.forEach((x, q) => { fuelS[x.i] = sub[q]; ml[x.i] = subMl[q]; });
        });
      };
      if (poolS > 0 || poolMl > 0) {
        if (knownKm > 0) spreadInGroups(poolS, poolMl, gKm);
        else spreadInGroups(poolS, poolMl, gKeys.map(() => 1)); // ไม่ทราบระยะทั้งวัน → หารเท่าทุกเที่ยว (ทุกกลุ่มเป็นเที่ยวเดี่ยว)
      } else {
        // ประมาณการ: Σน้ำมัน ÷ Σกม. (ทุกแถว รวมวิ่งเปล่า) ของรถคันนี้ใน estDays วันก่อนหน้า
        const since = addDays(date, -estDays);
        let win = hist.filter(h => h.date >= since && h.date < date);
        if (win.reduce((a, h) => a + h.km, 0) < estMinKm) win = hist.slice(-10);
        const wS = win.reduce((a, h) => a + h.fuelS, 0), wKm = win.reduce((a, h) => a + h.km, 0);
        const rate = wKm > 0 ? wS / wKm : 0; // สตางค์/กม.
        day.est_rate = wKm > 0 ? r2(rate / 100) : null;
        gKeys.forEach((k, j) => {
          const m = groups.get(k)!;
          if (gKm[j] > 0 && rate > 0) {
            const sub = splitByWeight(Math.round(rate * gKm[j]), hostW(m));
            m.forEach((x, q) => { fuelS[x.i] = sub[q]; mode[x.i] = 'estimate'; });
          } else m.forEach(x => { mode[x.i] = 'no_data'; });
        });
      }
      hist.push({ date, fuelS: ownS, km: allKm });
      if (!inRange(date)) continue;

      const dayTrips: TPTrip[] = info.map((x, k) => {
        const t = x.t, fuel = fromS(fuelS[k]), pay = tripPayOf(t), revenue = num(t.transport_price);
        const cost = r2(fuel + pay), profit = r2(revenue - cost);
        return {
          id: t.id, date, vehicle, plate_label: plateLabel,
          driver_id: t.driver_id, driver_name: t.drivers!.nickname || t.drivers!.name,
          round: k + 1, product: (t.product || '').trim(), origin: (t.origin || '').trim(), destination: (t.destination || '').trim(),
          km: x.km, group_host: x.grp !== x.i ? x.grp + 1 : null, group_size: 1,
          fuel, litres: ml[k] / 1000, fuel_mode: mode[k],
          pay, cost, revenue, profit,
          cost_per_km: x.km ? r2(cost / x.km) : null, profit_per_km: x.km ? r2(profit / x.km) : null,
          min_price: x.km ? r2(cost * (1 + margin)) : null,
          color: profitColor(profit, revenue),
          receipt_image_url: t.receipt_image_url ?? null,
        };
      });
      // กลุ่มไมล์: ต้นทุน/กม. กำไร/กม. ราคาขั้นต่ำ คิดทั้งกลุ่ม แสดงที่เที่ยวหลัก
      for (const h of dayTrips) {
        const mem = dayTrips.filter(m => m.group_host === h.round);
        if (!mem.length || !h.km) continue;
        const gc = [h, ...mem].reduce((a, t) => a + t.cost, 0), gp = [h, ...mem].reduce((a, t) => a + t.profit, 0);
        h.group_size = mem.length + 1;
        h.cost_per_km = r2(gc / h.km); h.profit_per_km = r2(gp / h.km); h.min_price = r2(gc * (1 + margin));
      }
      trips.push(...dayTrips);

      day.fuel_estimated = fromS(dayTrips.reduce((a, t) => a + (t.fuel_mode === 'estimate' ? toS(t.fuel) : 0), 0));
      days.push(day);
    }
  }

  trips.sort((a, b) => a.date.localeCompare(b.date) || a.vehicle.localeCompare(b.vehicle) || a.round - b.round);
  days.sort((a, b) => a.date.localeCompare(b.date) || a.vehicle.localeCompare(b.vehicle));

  const other_expenses: TPOtherExpense[] = counted
    .filter(t => inRange(t.date) && num(t.other_cost) !== 0)
    .map(t => {
      const label = (t.plate || '').trim() || t.drivers!.license_plate || '';
      return {
        id: t.id, date: t.date, vehicle: vehicleKey(label), plate_label: label,
        driver_name: t.drivers!.nickname || t.drivers!.name,
        item: (t.other_item || '').trim(), remarks: (t.remarks || '').trim(),
        route: isRealTrip(t) ? `${(t.origin || '').trim()} → ${(t.destination || '').trim()}` : null,
        amount: num(t.other_cost),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.vehicle.localeCompare(b.vehicle));

  const totals = summarizeTrips(trips, other_expenses);
  totals.off_trip_revenue = r2(days.reduce((a, d) => a + d.off_trip.revenue, 0));
  totals.off_trip_pay = r2(days.reduce((a, d) => a + d.off_trip.pay, 0));
  totals.fuel_no_trip = fromS(days.reduce((a, d) => a + toS(d.fuel_no_trip), 0));

  return { from, to, margin, trips, days, other_expenses, totals };
}

/** สรุปยอดของชุดเที่ยว (ใช้ทั้งทั้งช่วงและหลังกรองในหน้า) — ต้นทุน/กำไรต่อ กม. นับเฉพาะหน่วยที่ทราบระยะและใช้น้ำมันจริง */
export function summarizeTrips(trips: TPTrip[], others: TPOtherExpense[] = []): TPTotals {
  const S = (f: (t: TPTrip) => number) => fromS(trips.reduce((a, t) => a + toS(f(t)), 0));
  let uc = 0, up = 0, ukm = 0;
  for (const h of trips) {
    if (!h.km || h.fuel_mode !== 'actual') continue;
    const unit = [h, ...trips.filter(m => m.date === h.date && m.vehicle === h.vehicle && m.group_host === h.round)];
    uc += unit.reduce((a, t) => a + toS(t.cost), 0); up += unit.reduce((a, t) => a + toS(t.profit), 0); ukm += h.km;
  }
  const profit = S(t => t.profit), other = fromS(others.reduce((a, o) => a + toS(o.amount), 0));
  return {
    trip_count: trips.length,
    km: trips.reduce((a, t) => a + (t.km || 0), 0),
    unknown_km_trips: trips.filter(t => t.km == null).length,
    no_data_trips: trips.filter(t => t.fuel_mode === 'no_data').length,
    litres: Math.round(trips.reduce((a, t) => a + t.litres, 0) * 1000) / 1000,
    fuel_actual: S(t => (t.fuel_mode === 'actual' ? t.fuel : 0)),
    fuel_estimated: S(t => (t.fuel_mode === 'estimate' ? t.fuel : 0)),
    pay: S(t => t.pay), cost: S(t => t.cost), revenue: S(t => t.revenue), profit,
    cost_per_km: ukm ? r2(uc / 100 / ukm) : null, profit_per_km: ukm ? r2(up / 100 / ukm) : null,
    other_expenses: other, profit_after_other: r2(profit - other),
    off_trip_revenue: 0, off_trip_pay: 0, fuel_no_trip: 0,
  };
}

/** กระทบยอดกับรายงานรายเดือน (buildMonthlyReport ของเดือนเดียวกัน ไม่มีตัวกรอง)
 *  net_profit รายงาน = กำไรจากเที่ยว + น้ำมันประมาณการ (คืน เพราะไม่ใช่เงินจริง) + รายได้นอกเที่ยว − ค่าเที่ยวนอกเที่ยว
 *                      − น้ำมันวันที่ไม่มีเที่ยว − ค่าใช้จ่ายอื่น − ค่าใช้จ่ายเพิ่มเติม − เงินเดือนฐาน */
export function reconcileWithMonthlyReport(
  t: TPTotals,
  report: { net_profit: number; total_driver_cost: number; total_extra_expenses: number; total_commission: number },
) {
  const base = r2(report.total_driver_cost - report.total_commission);
  const lines: { label: string; amount: number }[] = [
    { label: 'กำไรจากเที่ยว', amount: t.profit },
    { label: 'คืนน้ำมันประมาณการ (ไม่ใช่เงินจริง)', amount: t.fuel_estimated },
    { label: 'รายได้นอกเที่ยว', amount: t.off_trip_revenue },
    { label: 'ค่าเที่ยวนอกเที่ยว', amount: -t.off_trip_pay },
    { label: 'น้ำมันวันที่ไม่มีเที่ยว (ไม่ได้ลงเที่ยวใด)', amount: -t.fuel_no_trip },
    { label: 'ค่าใช้จ่ายอื่นของเดือน', amount: -t.other_expenses },
    { label: 'ค่าใช้จ่ายเพิ่มเติม (ตารางค่าใช้จ่าย)', amount: -report.total_extra_expenses },
    { label: 'เงินเดือนฐาน', amount: -base },
  ];
  const total = r2(lines.reduce((a, l) => a + l.amount, 0));
  return { lines, total, report_net_profit: report.net_profit, diff: r2(total - report.net_profit) };
}
