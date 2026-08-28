# AUDIT: แอปรถพ่วง (truck-logistics-os) — โดย Dev2

**วันที่:** 2026-08-28
**ผู้ตรวจ:** Dev2
**ขอบเขต:** trips, jobs, drivers, payroll, advances, payslip, expenses, fuel, reports, alerts, documents, security (RLS + API auth)
**วิธีตรวจ:** ⚠️ **Static review ล้วน — อ่านซอร์สโค้ด + migration files เท่านั้น ไม่ได้รันแอปจริง ไม่ได้ต่อ Supabase จริง ไม่ได้ยิง API จริง** ทุกจุดที่ระบุคือสิ่งที่เห็นในโค้ด ต้องทดสอบ end-to-end จริงก่อน confirm push ทุกข้อ โดยเฉพาะข้อ CRITICAL

สรุปสั้น: เจอบั๊กที่กระทบเงินจริง (คอมมิชชั่น/เงินเดือน/P&L) และช่องโหว่ RLS ที่เปิด public access ข้อมูลการเงินลูกค้าโดยไม่ตั้งใจ — **ห้าม push ขึ้น live จนกว่าจะแก้ข้อ CRITICAL ทั้งหมดและทดสอบจริง**

---

## 🔴 CRITICAL — ต้องแก้ก่อน push เท่านั้น

### ความปลอดภัยข้อมูล

1. **RLS เปิด public access ให้ 5 ตาราง — ใครก็อ่าน/เขียนข้อมูลการเงินลูกค้าได้โดยไม่ต้อง login**
   `supabase/migrations/005_route_prices_payments_imports.sql:25,52,86`, `006_shipping_suppliers_documents.sql:22,45`
   Policy `route_prices_all`, `customer_payments_all`, `import_lots_all`, `shipping_suppliers_all`, `shipping_documents_all` ใช้ `FOR ALL USING (true)` โดย**ไม่มี `TO authenticated`** — ต่างจาก migration อื่น (002/003/008/009) ที่ทำถูก ผลคือ role `PUBLIC` (รวม `anon` key ที่ฝังอยู่ใน JS bundle ของเว็บทุกคนที่เปิดเข้ามา) สามารถ SELECT/INSERT/UPDATE/DELETE ตรงกับ PostgREST ของ `customer_payments` (ยอดชำระลูกค้า), `import_lots` (ต้นทุน/กำไรล็อต), `route_prices`, `shipping_suppliers`, `shipping_documents` ได้เลยโดยไม่ต้อง login
   **แก้:** เพิ่ม `TO authenticated` (หรือ role ที่เหมาะสม) ใน policy ทั้ง 5 ตัวทันที

2. **ตารางหลัก `drivers`, `customers`, `users`, `app_settings` ไม่มี migration file สร้างเลย — ตรวจ RLS ไม่ได้จาก static review**
   ไม่พบ `CREATE TABLE` ของ 4 ตารางนี้ใน `supabase/migrations/*.sql` ใดๆ (ตรงกับที่ migration 011 เองบันทึกไว้ว่ามี schema drift จากการแก้ผ่าน SQL Editor ตรงๆ มาก่อน) — เป็นตารางที่มี PII/ข้อมูลการเงินมากที่สุดในระบบ **ต้องเข้าไปเช็ค RLS จริงใน Supabase Dashboard ก่อน** ห้ามสรุปว่าปลอดภัยจากการอ่านโค้ดอย่างเดียว

3. **Cron alert engine เชื่อมกันไม่ติด — ระบบแจ้งเตือนอัตโนมัติไม่เคยทำงานเลย**
   `src/app/api/cron/alerts/route.ts:20-21` ส่ง header `x-cron-secret` แต่ `src/app/api/alerts/check/route.ts:29-30` เช็คจาก header **`x-internal-key`** เทียบ env คนละตัว (`INTERNAL_API_KEY` vs `CRON_SECRET`) — คนละชื่อกันทั้งคู่ ผลคือ Vercel Cron (รันทุกวัน 13:00) ยิงมาแล้ว **โดน 401 ทุกครั้ง** ตั้งแต่ deploy — ลูกค้าค้างชำระ/น้ำมันผิดปกติ/เบิกเกินวงเงิน ไม่มีการแจ้งเตือนอัตโนมัติเกิดขึ้นจริงเลยจนถึงตอนนี้
   **แก้:** ทำให้ header/env var สองฝั่งตรงกัน

### เงิน/บัญชี (Payroll, Advances, P&L)

4. **Payroll คำนวณใหม่ทับงวดที่อนุมัติ/จ่ายแล้วได้ ไม่มี guard ระดับ backend**
   `src/app/api/payroll/route.ts:107-128` — ปุ่ม "คำนวณใหม่" (`payroll/page.tsx:449-456`) ไม่ถูก gate ด้วยสถานะ ไม่ว่า `draft`/`approved`/`paid` ก็ POST เข้ามาคำนวณทับได้หมด และ upsert จะรีเซ็ต `status` กลับเป็น `'draft'` เสมอ — งวดที่จ่ายเงินจริงไปแล้วสามารถถูกคำนวณทับได้

5. **Payroll upsert ล้าง `other_deductions`/`other_additions` ทิ้งทุกครั้ง — การปรับยอดมือหายไปเงียบๆ**
   `src/app/api/payroll/route.ts:117-118` hardcode `other_deductions: 0, other_additions: 0` ทุกครั้งที่ recalc และหน้า payroll auto-recalc ทุกงวด draft ทุกครั้งที่เปิดหน้า (`page.tsx:112-121`) — บัญชีปรับยอดผ่าน general-edit endpoint เสร็จ แค่มีคนเปิดหน้า payroll ซ้ำ ยอดที่ปรับก็หายกลับไปเป็น 0

6. **`/api/payroll/[id]` PATCH mass-assignment ข้าม state machine ได้**
   `src/app/api/payroll/[id]/route.ts:37-40` branch general-edit รับ body ทั้งก้อนจาก client เข้า `.update(rest)` ตรงๆ ไม่ whitelist ฟิลด์ — ส่ง `{status:'paid', net_pay: 999999}` ผ่านมาตรงๆ ได้เลย ข้ามเงื่อนไข `draft→approved→paid` ที่ action อื่นบังคับไว้

7. **วงเบิก (monthly advance limit) ไม่ถูกบังคับจริงระดับ backend**
   `src/app/api/advances/route.ts:69-83` เช็คยอดใช้ไปจากสถานะ `approved`/`paid` เท่านั้น ไม่นับ `pending` — คำขอ pending หลายใบยื่นแยกกันผ่านการเช็คทีละใบได้หมด และ `src/app/api/advances/[id]/route.ts:44-68` ตอน approve **ไม่เช็ควงเบิกซ้ำเลย** ยอดเบิกจริงรวมเกิน limit ได้

8. **คอมมิชชั่นคนขับ hardcode 10% global ไม่ใช้ `commission_rate` ต่อคนที่ตั้งไว้จริง**
   `src/components/trips/TripForm.tsx:139` ใช้ `COMMISSION_RATE` คงที่ (`src/lib/constants.ts:22` = 0.10) ทั้งที่หน้า Drivers มีฟิลด์ `commission_rate` ต่อคนขับให้แก้ไขได้ — ถ้าคนขับคนไหนไม่ใช่ 10% ระบบจ่าย/หักผิดทุกเที่ยวโดยไม่มีใครรู้ กระทบเงินเดือนคนขับโดยตรง (ปัญหาเดียวกันซ้ำที่ `drivers/page.tsx:60` และ `reports/monthly/route.ts:133`)

9. **สูตร "กำไรสุทธิ" บนแดชบอร์ดหลักผิด**
   `src/app/(main)/trips/page.tsx:146-148` — `totalSalaries = activeDrivers * (selectedDriver?.base_salary ?? 0)` เอาเงินเดือนของ "คนขับที่กำลังเลือกอยู่คนเดียว" ไปคูณจำนวนคนขับทั้งหมด แทนที่จะบวกเงินเดือนจริงของแต่ละคน แถมมี hardcode fallback `|| 2` คนขับตอนไม่มีข้อมูล — ตัวเลขกำไรสุทธิที่เจ้าของใช้ตัดสินใจธุรกิจผิดทันทีถ้าคนขับเงินเดือนไม่เท่ากัน

10. **trips ↔ jobs ซ้ำซ้อนกันจริง ไม่มีการเชื่อมข้อมูล**
    Migration `003_jobs_expenses_payroll_alerts.sql:27-28` เตรียมคอลัมน์ `jobs.trip_id`/`jobs.fuel_event_id` ไว้ แต่ไม่มีจุดไหนในโค้ด (`jobs/page.tsx`, `api/jobs/route.ts`, `api/jobs/[id]/route.ts`) อ่าน/เขียนคอลัมน์นี้เลย เมื่องานปิด (`closed`) ไม่มีการสร้างแถว `trips` อัตโนมัติ — สองระบบเก็บ origin/destination/product/weight/ราคา/driver ซ้ำกันคนละตาราง คนละสูตรรายได้ (`jobs.selling_price` vs `trips.transport_price`) พนักงานต้องกรอกซ้ำเอง เสี่ยงนับรายได้ซ้ำหรือรายได้หายไปเลย

11. **`fuel_events` (OCR fuel) ไม่ถูกรวมใน monthly P&L เลย — เสี่ยงนับซ้ำหรือขาดหาย**
    `src/app/api/reports/monthly/route.ts:31-66` รวมต้นทุนจาก `trips.fuel_cost` และ `expenses` table เท่านั้น ไม่เคย query `fuel_events` เลย ทั้งที่เป็น flow เต็มรูปแบบ (LINE bot → OCR → verify → pay) แยกต่างหาก ไม่มีโค้ดใด sync `fuel_events.amount_baht` เข้า `trips.fuel_cost` หรือ `expenses` — ถ้าคนขับเติมน้ำมันผ่าน LINE/OCR แล้วออฟฟิศกรอกซ้ำใน trip sheet = นับซ้ำ ถ้าไม่กรอกซ้ำ = ยอดหายจาก P&L เลย **นี่คือบั๊กแพทเทิร์นเดียวกับที่เจอใน APPลาน**

12. **`expenses` table ซ้อนทับกับ `trips.other_cost`/`fuel_cost` ได้ รวมถึงหมวด `fuel` ที่แยกออกจาก `total_fuel_cost`**
    `reports/monthly/route.ts:51-66` รวม `expenses` ตาม `driver_id` โดยไม่เช็คว่าซ้ำกับ `trip_id`/`job_id` ที่มีอยู่แล้วไหม และ `expenses.category` อนุญาตค่า `'fuel'` ได้ (`003_jobs_expenses_payroll_alerts.sql:69-72`) ซึ่งจะไปรวมใน `total_extra_expenses` แยกจาก `total_fuel_cost` (ที่มาจาก `trips.fuel_cost` เท่านั้น) — ค่าใช้จ่ายจริงตัวเดียวกัน (เช่น ค่าทางด่วน/ค่าน้ำมัน) กรอกซ้ำได้ 2 ทาง แล้วไปโผล่คนละบรรทัดใน P&L หรือถูกนับซ้ำ

13. **`trips.expense_notes` เป็นคอลัมน์ที่มีข้อมูลจริงบน production แต่ไม่ถูกรวมในรายงานการเงินเลย**
    Migration `011_trips_expense_notes.sql` ยืนยันว่าคอลัมน์นี้เกิดจาก schema drift และมีข้อมูลจริงอยู่ แต่ `dashboard/page.tsx:129-134` อ่านมาแสดงแค่ list สวยๆ ไม่รวมเข้า `reportKPI.profit` (`dashboard/page.tsx:200-205`) และ `reports/monthly` ไม่อ้างอิงคอลัมน์นี้เลยแม้แต่จุดเดียว — ไม่มีจุดไหนในโค้ดปัจจุบันเขียนลงคอลัมน์นี้ด้วย (orphaned) ถ้ามีเครื่องมือ/คนกรอกอยู่ ยอดนั้นจะหายจาก P&L ทางการโดยไม่มีใครรู้ตัว

---

## 🟠 HIGH

**Trips/Jobs**
- `trips/page.tsx:418-423` — query expenses ด้วย `.lte('date', '${yr}-${mo}-31')` ทุกเดือน เดือนที่มี <31 วัน (ก.พ./เม.ย./มิ.ย./ก.ย./พ.ย.) จะส่ง literal date ที่ไม่มีจริง Postgres throw error แต่โค้ดไม่เช็ก `error` เลย → ตารางค่าใช้จ่ายแสดง "ไม่พบรายการ" ผิดๆ ทุกเดือนที่ไม่ใช่ 31 วัน (silent wrong data ที่ผู้ใช้เห็นจริงบ่อยครั้ง)
- `src/app/api/jobs/[id]/route.ts:79-83` — general update spread `...rest` เข้า `.update()` ตรงๆ ไม่ allowlist ฟิลด์ — ปลอมแปลง `closed_by`/`closed_at`/`deleted_at`/`trip_id` ได้
- `src/app/api/jobs/route.ts:69` — validate แค่ `selling_price === undefined` ไม่เช็คติดลบ/NaN เช่นเดียวกับ `weight_kg`

**Payroll/Advances**
- ยอดสุทธิ payroll ≠ payslip เมื่อคนขับมี advance ที่ไม่ผูกกับทริป — `api/payroll/route.ts:92-95` เลือกใช้ `totalWithdrawFromTrips` หรือ `totalAdvanceRequests` อย่างใดอย่างหนึ่ง แต่ `calcNetPay()` (`src/lib/utils.ts:98-106`) ที่หน้า payslip ใช้จริงนับเฉพาะ `trips.withdraw` ไม่แตะ `advance_requests` เลย — สลิปที่พิมพ์ให้คนขับกับยอดในระบบ payroll ไม่ตรงกัน
- `api/advances/route.ts:59-63` ไม่เช็คว่า driver มีอยู่จริงก่อน insert, `.single()` คืน null ก็ไม่ error, comment ในโค้ดเองยืนยันว่า "no FK constraint"
- `api/advances/route.ts:55` validate แค่ `!driver_id || !amount` ไม่กันค่าติดลบ (`-5000` ผ่านได้ เพราะ falsy เฉพาะ 0) กระทบ limit calculation และ net_pay ผิดทาง
- คอมมิชชั่น fallback ไม่ตรงกันระหว่าง payroll (`t.transport_price * 0.10` เมื่อ `trip_pay` null) กับ payslip (`t.trip_pay || 0` ไม่มี fallback) — ทริปเดียวกันให้ค่าคอมมิชชั่นต่างกันคนละหน้าจอ

**Fuel**
- OCR fuel เขียน `amount_baht`/`fuel_liters`/`price_per_liter`/`odometer` ตรงจาก GPT-4o Vision โดยไม่เช็ค `fuel_liters × price_per_liter ≈ amount_baht`, ไม่กันค่าติดลบ/ศูนย์, ไม่เช็ค odometer เพิ่มขึ้นจริง (`api/fuel/ocr/route.ts:87-98`, `src/lib/ocr/fuel.ts:112-119`)
- Anomaly detection ข้ามการเช็คสำหรับคนขับใหม่ที่มีประวัติ paid <3 รายการ (`src/lib/ocr/fuel.ts:162-175`, `api/fuel/ocr/route.ts:71-83,77`) — ช่วงที่เสี่ยงสุด (ยังไม่มีใครคุ้นกับยอดปกติของคนขับ) กลับไม่มีการป้องกันเลย
- `/api/fuel/[id]` PATCH branch ที่ไม่ส่ง `action` มา ไม่เช็ค role เลย (`fuel/[id]/route.ts:128-150`) ต่างจาก action `verify`/`pay` ที่เช็ค role ไว้ — แก้ `amount_baht`/`odometer`/`payment_method` ของ fuel event ใดก็ได้โดยไม่ผ่านการตรวจสอบ

**Alerts**
- Alert dedup เช็คด้วย `type + title` แต่ title เป็น string คงที่ไม่ผูก job/driver (เช่น "ลูกค้าค้างชำระเกินกำหนด" เฉยๆ) — เมื่อ job A มี alert unread อยู่แล้ว job B ที่ค้างชำระตามมาจะถูกมองว่าซ้ำแล้ว**ไม่สร้าง alert ให้เลย** (`api/alerts/check/route.ts:20-24,49,67,97`) ยิ่งกระทบหนักเพราะรวมกับบั๊ก CRITICAL #3 ที่ cron ไม่เคยรันสำเร็จอยู่แล้ว

---

## 🟡 MEDIUM

- `TripForm.tsx:150-154` — ไมล์ปลาย < ไมล์ต้น (กรอกผิด/สลับเลข) → `calcDistance` เซ็ต 0 เงียบๆ แทนเตือน
- `trips/page.tsx:377-411` (import CSV) เขียนตรงเข้า DB โดย bypass zod schema/validate ของฟอร์มทั้งหมด เช็คแค่ `isNaN`
- `drivers/page.tsx:60` hardcode fallback `0.10` ในสถิติ "ค่ารอบรวม" แทนใช้ `commission_rate` จริง (ปัญหาเดียวกับ CRITICAL #8)
- `trips/page.tsx:296-309` `validateDate` ไม่เช็คช่วง d(1-31)/m(1-12) — `32/13/2569` หลุดเข้า insert แล้วไปพังที่ Postgres แทน
- `api/jobs/parse/route.ts` (OpenAI) ไม่มี rate limit ต่อ user — ต้นทุน OpenAI ไม่ถูกควบคุม
- `api/payroll/route.ts:6-11` ฟังก์ชัน `floorTen()` ประกาศไว้แต่ไม่เคยถูกเรียก ขณะที่ UI (`page.tsx:545`) เขียนว่า "ปัดลงทศนิยมสิบ" — ข้อความ UI กับ logic จริงไม่ตรงกัน
- Race condition (TOCTOU) ในการเช็ควงเบิก — อ่าน/เช็ค/insert แยกกัน 2 query ไม่มี transaction/lock (`api/advances/route.ts:69-83`)
- เอกสารสัญญาจ้าง/เลิกจ้างไม่บังคับ `base_salary`/`final_salary` — พิมพ์ "NaN บาท/เดือน" หรือ "undefinedบาทถ้วน" ลงเอกสารทางการได้จริง (`api/documents/employment-contract/route.ts:39-41,106`, `termination-letter/route.ts:56-58,71,74`)
- Fixed cost ต่อคนขับ dedup ตามป้ายทะเบียน มอบให้คนขับที่มีเที่ยวเยอะสุดในเดือนทั้งหมด คนที่เปลี่ยนรถกลางเดือนได้ `truck_fixed_cost = 0` ผิดจากจริง (`reports/monthly/route.ts:164-180`) — ยอดรวมบริษัทถูก แต่ P&L รายคนขับผิด
- `trips/page.tsx:418-424` ซ่อนหมวด `fuel`/`advance` จาก tab "ค่าใช้จ่ายอื่น" ขณะที่หน้า expenses/reports โชว์ทุกหมวด — ผู้ใช้มองไม่เห็นว่ามีรายการน้ำมันแล้ว เสี่ยงกรอกซ้ำ (เชื่อมกับ CRITICAL #12)
- `api/line/daily-summary/route.ts:19-23` — ถ้าไม่ตั้ง `INTERNAL_API_KEY`/`CRON_SECRET` ทั้งคู่ auth check จะ **fail-open** (ข้ามการเช็คไปเลย) ผิดหลัก secure-by-default
- URL fallback คนละโดเมนระหว่าง `cron/alerts/route.ts:15` (`truck-logistics.vercel.app`) กับ `line/webhook/route.ts:308` (`truck-logistics-me62.vercel.app`) ใช้ env var คนละชื่อกันด้วย (`SITE_URL` vs `APP_URL`)
- `fuel/[id]/route.ts:15-32` GET ไม่มี auth check ในโค้ด พึ่ง RLS อย่างเดียว — ถ้า RLS ถูกแก้พลาดแบบเดียวกับ CRITICAL #1 จะเปิดข้อมูลทันทีโดยไม่มีชั้นป้องกันที่ app layer
- HR documents API (`employment-contract`, `termination-letter`) เช็คแค่ login ไม่เช็ค role — authenticated user คนไหนก็ generate เอกสารเงินเดือน/ค่าตอบแทนของคนขับคนไหนก็ได้

---

## 🔵 LOW

- `jobs/page.tsx:460` — `data.weight_kg || p.weight_kg` ถือ 0 เป็น falsy ทำให้ AI parse ที่ได้ 0 จริงๆ ถูกเมินทิ้ง
- RLS policy `jobs`/`expenses` เป็น `USING(true) WITH CHECK(true)` สำหรับ authenticated ทุกคน (`003_...sql:173-176`) — ไม่มีแยกสิทธิ์ตาม role เลย ทำให้ mass-assignment bug ด้านบนรุนแรงขึ้นเพราะ DB ไม่ช่วยกันอีกชั้น
- `trips/page.tsx:104-124` ดึงทุกแถวไม่มี `.limit()` แล้ว filter ฝั่ง client ทุก realtime event — ยังไม่พังตอนนี้แต่จะเริ่มช้าเมื่อข้อมูลเยอะขึ้น
- `api/advances/route.ts:66` hardcode fallback `|| 5000` ซ้ำกับ default ใน migration (ต้องแก้ 2 จุดถ้าเปลี่ยนนโยบาย) และบังหน้าปัญหา driver ไม่พบตัวตน
- Payroll auto-recalculate ทุกงวด draft ทุกครั้งที่เปิดหน้า ยิง POST ซ้อนกันได้
- `expenses/[id]` PATCH ไม่มี field allowlist ต่างจาก `fuel/[id]` ที่มี pattern ป้องกันไว้แล้ว — เขียนตาม pattern เดียวกันให้สม่ำเสมอ
- LINE signature comparison ใช้ `===` ธรรมดา ไม่ใช่ `crypto.timingSafeEqual()` — timing side-channel เชิงทฤษฎี (`src/lib/line/webhook.ts:21`)
- `employment-contract/route.ts:36` hardcode `contract_location = 'จังหวัดเชียงราย'` ไม่ผูกกับข้อมูลบริษัทจริง

---

## ✅ ตรวจแล้วไม่พบปัญหา

- LINE webhook signature verification มีและถูกต้อง (`webhook/route.ts:59`)
- `/api/alerts/check` เช็ค `INTERNAL_API_KEY` ถูกต้อง (ปัญหาคือคนละคู่กับ cron เท่านั้น — ดู CRITICAL #3)
- `/api/cron/alerts` เช็ค `CRON_SECRET` แบบ fail-closed ถูกต้อง
- ไม่พบ API key/secret/JWT hardcode ในซอร์ส `.ts/.tsx` — ทุกจุดดึงจาก `process.env.`
- API routes อื่นๆ (advances, expenses, jobs, payroll, fixed-expenses, reports, vehicle-documents) มี `auth.getUser()` guard ครบทุก handler ที่ตรวจ

---

## สรุปสำหรับ CEO

ระบบนี้ยังไม่พร้อม push ขึ้น live ในสภาพปัจจุบัน จุดที่กระทบเงินจริงตรงที่สุดคือ **ข้อ 4-13 (payroll/advances/P&L)** เพราะเป็นตัวเลขที่คนขับได้รับจริงและเจ้าของใช้ดูกำไร-ขาดทุนจริง กับ **ข้อ 1-2 (RLS)** เพราะเปิดข้อมูลการเงินลูกค้าให้คนนอกเข้าถึงได้โดยไม่ต้อง login

ลำดับที่แนะนำให้แก้ก่อน:
1. ปิดรู RLS (ข้อ 1) — เร่งด่วนสุดเพราะเป็นช่องโหว่ live อยู่ตอนนี้
2. เช็ค RLS ตาราง drivers/customers/users/app_settings ใน Dashboard จริง (ข้อ 2)
3. แก้ cron/alerts header mismatch (ข้อ 3) — ระบบแจ้งเตือนใช้งานไม่ได้เลยตั้งแต่ deploy
4. เคลียร์ payroll/advances guard ทั้งหมด (ข้อ 4-7) ก่อนงวดจ่ายเงินจริงงวดถัดไป
5. ตัดสินใจ business rule ว่า trips vs jobs vs expenses vs fuel_events จะให้เป็นแหล่งข้อมูล P&L เดียวยังไง (ข้อ 8-13) — อันนี้เป็นงาน design ต้องคุยกับ Dev1/CEO ก่อน ไม่ใช่แค่ patch โค้ด

ทุกข้อในเอกสารนี้เป็น static review — ก่อน merge ต้องรันจริงทดสอบ end-to-end ทีละ flow (โดยเฉพาะ payroll recalculate, advance limit, fuel OCR) ไม่ใช่แค่อ่านโค้ดผ่านแล้วเชื่อ
