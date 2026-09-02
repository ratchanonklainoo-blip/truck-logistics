'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import CoordPasteInput from '@/components/ui/CoordPasteInput';

interface Props {
  driverId: string;
  onSaved: (loc: { lat: number; lng: number; recorded_at: string }) => void;
  onCancel?: () => void;
}

export default function SaveLocationInline({ driverId, onSaved, onCancel }: Props) {
  const [supabase] = useState(() => createClient());
  const [coordText, setCoordText] = useState('');
  const [resolvedCoord, setResolvedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const coord = resolvedCoord;
    if (!coord) {
      alert('รูปแบบไม่ถูกต้อง หรือกำลังแปลงลิงก์ยังไม่เสร็จ — วางลิงก์ Google Maps หรือพิกัด lat,lng เช่น 19.108231,100.067771');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('truck_locations')
      .insert({ driver_id: driverId, lat: coord.lat, lng: coord.lng, source: 'manual' });
    setSaving(false);
    if (error) {
      alert('บันทึกตำแหน่งไม่สำเร็จ: ' + error.message);
      return;
    }
    onSaved({ lat: coord.lat, lng: coord.lng, recorded_at: new Date().toISOString() });
    setCoordText('');
    setResolvedCoord(null);
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="w-64">
        <CoordPasteInput
          value={coordText}
          onChange={setCoordText}
          onResolvedChange={setResolvedCoord}
          className="form-input text-xs w-full"
        />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="btn-secondary text-xs px-3 py-1.5"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึกตำแหน่ง'}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          title="ยกเลิก"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
