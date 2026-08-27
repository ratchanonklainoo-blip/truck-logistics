# 🚛 ณสิริทรัพย์ Logistics OS — คู่มือติดตั้ง

## ภาพรวม Tech Stack (ฟรีทั้งหมด/ราคาถูก)

| บริการ | ใช้ทำอะไร | ราคา |
|--------|----------|------|
| **Supabase** | Database + Auth + Realtime | ฟรี (500MB, 50k rows) |
| **Vercel** | Host Next.js | ฟรี |
| **LINE Messaging API** | Bot คนขับ (Phase 2) | ฟรี (500 msg/เดือน) |
| **OpenAI GPT-4o** | OCR ใบเสร็จ (Phase 2) | จ่ายตามใช้งาน ~฿0.60/ครั้ง |

> **แทน n8n ด้วย Supabase Edge Functions** — ฟรี 500,000 invocations/เดือน

---

## ขั้นตอน 1 — สร้าง Supabase Project

1. ไปที่ [supabase.com](https://supabase.com) → Sign In ด้วย GitHub
2. กด **"New Project"**
3. ตั้งค่า:
   - **Name:** `truck-logistics`
   - **Database Password:** ตั้งรหัสผ่านแข็งแรง (จำไว้)
   - **Region:** `Southeast Asia (Singapore)`
4. รอ ~2 นาที ให้ project สร้างเสร็จ

---

## ขั้นตอน 2 — รัน Database Schema

1. ใน Supabase → ไปที่ **SQL Editor**
2. กด **"New Query"**
3. เปิดไฟล์ `schema.sql` ในโฟลเดอร์นี้
4. **Copy ทั้งหมด** → Paste ใน SQL Editor
5. กด **"Run"** (▶️)

✅ ถ้าสำเร็จ จะเห็น: `Success. No rows returned`

---

## ขั้นตอน 3 — ดึง API Keys

1. Supabase → **Project Settings** → **API**
2. คัดลอก:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key → `eyJhbGci...`

---

## ขั้นตอน 4 — สร้าง Login User

1. Supabase → **Authentication** → **Users** → **"Invite user"**
2. ใส่อีเมลของคุณ (เช่น `ratchanonklainoo@gmail.com`)
3. กด **Send Invite** → ตรวจอีเมล → ตั้งรหัสผ่าน

หรือ ใน SQL Editor:
```sql
-- สร้าง user ตรงๆ (เปลี่ยน email และ password)
SELECT supabase_auth.create_user(
  'ratchanonklainoo@gmail.com',
  'your_password_here'
);
```

---

## ขั้นตอน 5 — ติดตั้งและรัน Local

```bash
# Clone / เปิด terminal ใน folder นี้
cd "path/to/แอปรถพ่วง"

# ติดตั้ง dependencies
npm install

# สร้างไฟล์ .env.local
cp .env.local.example .env.local
```

แก้ไข `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

```bash
# รัน development server
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) → Login ด้วยอีเมลที่สร้าง

---

## ขั้นตอน 6 — Deploy ขึ้น Vercel

1. ไปที่ [vercel.com](https://vercel.com) → Login ด้วย GitHub
2. กด **"New Project"**
3. Import โปรเจกต์นี้ (push ขึ้น GitHub ก่อน)
4. ตั้ง **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...
   ```
5. กด **Deploy** → รอ 2-3 นาที

✅ ได้ URL เช่น `https://truck-logistics.vercel.app`

---

## ขั้นตอน 7 — เปิด Realtime สำหรับ trips

1. Supabase → **Database** → **Replication**
2. หา table `trips` → เปิด toggle ✅
3. (Optional) เปิด `drivers`, `customers` ด้วย

---

## Phase 2 — LINE Bot (ทำทีหลัง)

### กรณีที่ใช้ LINE Channel เดิม

LINE รองรับได้ **1 webhook URL** ต่อ 1 channel

**วิธีย้าย webhook:**
1. ไปที่ [LINE Developer Console](https://developers.line.biz/console/)
2. เลือก channel → **Messaging API** → **Webhook settings**
3. เปลี่ยน Webhook URL เป็น:
   ```
   https://xxxx.supabase.co/functions/v1/line-webhook
   ```
4. ✅ ไม่ต้องสร้าง channel ใหม่ — ใช้ channel เดิมได้เลย

> ⚠️ ถ้า channel เดิมเชื่อมต่อกับระบบอื่น (เช่น chatbot อื่น) ต้องตัดสินใจว่าจะย้าย webhook ทั้งหมด หรือสร้าง channel ใหม่

### ตั้งค่า LINE env ใน .env.local:
```env
LINE_CHANNEL_ACCESS_TOKEN=your_token_here
LINE_CHANNEL_SECRET=your_secret_here
```

---

## การแก้ไขบัค PDF (สิ่งที่ fix แล้วใน v2)

| ปัญหาเดิม | สิ่งที่แก้แล้ว |
|-----------|--------------|
| ชื่อบริษัทผิด | ดึงจาก `COMPANY.name` constant เสมอ — ไม่ใช่ state ที่แก้ได้ |
| ฟอนต์เล็กเกิน | Company name: `22px font-weight:800` / content: `13px` ขั้นต่ำ |
| PDF เบลอ | `html2canvas scale: 3` + `windowWidth: 794px` |
| Thai font ไม่โหลด | Embed `@import Sarabun` ใน PDF content + inject ใน `onclone` |

---

## โครงสร้างไฟล์

```
src/
├── app/
│   ├── login/page.tsx          ← หน้า Login
│   ├── (main)/
│   │   ├── layout.tsx          ← Auth guard + Sidebar
│   │   ├── dashboard/page.tsx  ← ศูนย์ควบคุม + Charts
│   │   ├── trips/page.tsx      ← เที่ยววิ่ง (หน้าหลัก)
│   │   ├── payslip/page.tsx    ← ใบจ่ายเงิน PDF ← แก้บัคแล้ว
│   │   ├── customers/page.tsx  ← ลูกค้า
│   │   ├── drivers/page.tsx    ← คนขับ
│   │   └── settings/page.tsx   ← ตั้งค่า
├── components/
│   ├── layout/Sidebar.tsx
│   ├── trips/TripForm.tsx      ← ฟอร์มกรอกข้อมูล
│   └── trips/TripTable.tsx     ← ตารางรายการ
├── lib/
│   ├── constants.ts            ← COMPANY, DRIVERS, PDF_CONFIG
│   ├── utils.ts                ← คำนวณ, format, floorToNearest10
│   └── supabase/{client,server}.ts
└── types/index.ts
```

---

## Business Logic ที่ implement แล้ว

```
ค่ารอบ = ราคาค่าขนส่ง × 10%
ระยะทาง = ไมล์ปลาย - ไมล์ต้น
อัตราสิ้นเปลือง = ระยะทางรวม ÷ ลิตรรวม (กม./ลิตร)
ยอดสุทธิ = ค่ารอบ + เงินเดือน - หักเบิก - ประกันสังคม
ปัดเศษ = Math.floor(x / 10) * 10  ← ปัดลงเสมอ ห้ามปัดขึ้น
```

---

*จัดทำโดย Claude (Anthropic) | หจก.ณสิริทรัพย์ การเกษตร | พฤษภาคม 2568*
