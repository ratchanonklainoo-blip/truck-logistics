-- Migration 019: line_sessions — unique บน line_user_id
-- เหตุผล: api/line/webhook ใช้ upsert(..., { onConflict: 'line_user_id' }) แต่ตารางมีแค่ PK (id)
--         ไม่มี unique บน line_user_id → Postgres ตอบ 42P10 และ session คำสั่ง LINE (!เบิก/น้ำมัน) ไม่เคยถูกบันทึก
-- idempotent: รันซ้ำได้ ตารางตอนนี้ว่าง (0 แถว) จึงไม่มีข้อมูลซ้ำที่ทำให้สร้าง index ไม่ได้
-- ผลต่อ RLS: ไม่มี — เพิ่ม index อย่างเดียว policy "service_all_line_sessions" (service_role) เดิมใช้ต่อได้

-- กันกรณีมีหลายแถวต่อผู้ใช้ (ถ้ามี) ให้เหลือแถวล่าสุดก่อนสร้าง unique
DELETE FROM line_sessions a
USING line_sessions b
WHERE a.line_user_id = b.line_user_id
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS line_sessions_line_user_id_key
  ON line_sessions (line_user_id);
