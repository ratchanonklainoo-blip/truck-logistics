'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isShortMapsLink, parseGoogleMapsLink } from '@/lib/utils';
import MapsLink from './MapsLink';

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onResolvedChange?: (coord: { lat: number; lng: number } | null) => void;
  placeholder?: string;
  className?: string;
  mapsLabel?: string;
}

export default function CoordPasteInput({ id, value, onChange, onResolvedChange, placeholder, className, mapsLabel }: Props) {
  const [resolving, setResolving] = useState(false);
  const [shortLinkError, setShortLinkError] = useState('');
  const [asyncCoord, setAsyncCoord] = useState<{ lat: number; lng: number } | null>(null);
  const requestSeq = useRef(0);

  const trimmed = value.trim();
  const syncCoord = trimmed ? parseGoogleMapsLink(trimmed) : null;
  const isShort = !syncCoord && isShortMapsLink(trimmed);
  const resolved = syncCoord ?? (isShort ? asyncCoord : null);
  const invalid = trimmed !== '' && !syncCoord && !isShort && !resolving;

  useEffect(() => {
    setShortLinkError('');
    setAsyncCoord(null);
    if (syncCoord) {
      onResolvedChange?.(syncCoord);
      setResolving(false);
      return;
    }
    onResolvedChange?.(null);
    if (!isShort) {
      setResolving(false);
      return;
    }
    const seq = ++requestSeq.current;
    setResolving(true);
    fetch('/api/resolve-maps-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    })
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (seq !== requestSeq.current) return; // ค่าถูกพิมพ์ต่อระหว่างรอ — ทิ้งผลลัพธ์เก่า
        if (!ok || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
          setShortLinkError(body?.error || 'แปลงลิงก์ไม่สำเร็จ');
          onResolvedChange?.(null);
          return;
        }
        setAsyncCoord({ lat: body.lat, lng: body.lng });
        onResolvedChange?.({ lat: body.lat, lng: body.lng });
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setShortLinkError('เชื่อมต่อเพื่อแปลงลิงก์ไม่สำเร็จ');
        onResolvedChange?.(null);
      })
      .finally(() => {
        if (seq === requestSeq.current) setResolving(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  return (
    <div>
      <input
        id={id}
        type="text"
        className={className ?? 'form-input text-xs'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'วางลิงก์ Google Maps หรือพิกัด lat,lng'}
      />
      {resolving && (
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> กำลังแปลงลิงก์ย่อ...
        </p>
      )}
      {!resolving && resolved && (
        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5 flex-wrap">
          {resolved.lat.toFixed(6)}, {resolved.lng.toFixed(6)}
          <MapsLink lat={resolved.lat} lng={resolved.lng} label={mapsLabel ?? 'เปิดแผนที่'} />
        </p>
      )}
      {!resolving && shortLinkError && (
        <p className="text-xs text-red-500 mt-1">{shortLinkError}</p>
      )}
      {invalid && (
        <p className="text-xs text-red-500 mt-1">
          รูปแบบไม่ถูกต้อง — วางลิงก์ Google Maps หรือพิกัด lat,lng เช่น 19.108231,100.067771
        </p>
      )}
    </div>
  );
}
