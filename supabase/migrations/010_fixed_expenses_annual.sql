-- Migration 010: Add 'annual' category to fixed_expenses
-- Drop old constraint and recreate with annual added

ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_category_check;

ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_category_check
  CHECK (category IN (
    'insurance',    -- ประกันภัย
    'installment',  -- ค่างวด
    'maintenance',  -- ค่าบำรุงรักษา
    'tax',          -- ภาษีรถ
    'annual',       -- จ่ายรายปี (เช่น ประกันสินค้า)
    'other'         -- อื่นๆ
  ));
