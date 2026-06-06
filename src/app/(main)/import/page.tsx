'use client';

import { Ship, Clock } from 'lucide-react';

export default function ImportPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
        <Ship className="w-10 h-10 text-slate-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-700 mb-2">ระบบชิปปิ้ง</h1>
      <div className="flex items-center gap-2 text-slate-500 mb-4">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">กำลังพัฒนา</span>
      </div>
      <p className="text-slate-400 text-sm max-w-sm">
        ระบบบริหารล็อตชิปปิ้งสินค้านำเข้า จะพร้อมใช้งานในเวอร์ชันถัดไป
      </p>
    </div>
  );
}
