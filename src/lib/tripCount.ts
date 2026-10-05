// กติกานับ "เที่ยว": แถวที่ต้นทางและปลายทางเป็น '-' หรือว่าง (''/NULL) ทั้งคู่ ไม่นับเป็นเที่ยว
// (เป็นการเบิก/ค่าใช้จ่ายอื่น เช่น ถ่ายน้ำมันเครื่อง) — ใช้กับ "จำนวนเที่ยว" เท่านั้น
// ยอดเงินของแถวนั้น (ค่าขนส่ง/ค่าเที่ยว/น้ำมัน/เบิก/อื่นๆ) ยังนับตามเดิมทุกที่
type TripPlaces = { origin?: string | null; destination?: string | null };

const isBlankPlace = (v: string | null | undefined): boolean => {
  const s = (v ?? '').trim();
  return s === '' || s === '-';
};

export function isRealTrip(trip: TripPlaces): boolean {
  return !(isBlankPlace(trip.origin) && isBlankPlace(trip.destination));
}

export function countRealTrips(trips: TripPlaces[]): number {
  return trips.reduce((n, t) => n + (isRealTrip(t) ? 1 : 0), 0);
}
