// หน้าที่ CEO เลิกใช้ — ซ่อนจากเมนู/ลิงก์ และ middleware redirect ไป /dashboard
// ไม่ได้ลบตาราง ข้อมูล หรือ API (payroll หักเบิก และ LINE !เบิก ยังอ้างถึง)
// เปิดคืน: ลบ path ออกจากรายการนี้ที่เดียว (เมนู ลิงก์ในหน้าแจ้งเตือน และ redirect จะกลับมาเอง)
export const HIDDEN_ROUTES: readonly string[] = ['/fuel', '/advances'];

export function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
}
