'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { filterSuggestions } from '@/lib/suggestions';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  className?: string;
}

// ช่องพิมพ์ + รายการแนะนำที่กรองตามที่พิมพ์ — เลือกจากรายการหรือพิมพ์ข้อความอิสระก็ได้
export default function ComboInput({ id, value, onChange, options, placeholder, className = 'form-input' }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => filterSuggestions(options, value), [options, value]);
  const listId = `${id}-list`;
  const showList = open && items.length > 0;

  useEffect(() => { setActive(-1); }, [value]);

  // เลื่อนรายการให้เห็นตัวที่เลือกด้วยคีย์บอร์ด
  useEffect(() => {
    if (active < 0) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto overflow-x-hidden bg-white border border-slate-200 rounded-lg shadow-lg py-1"
        >
          {items.map((o, i) => (
            <li
              key={o}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (ไม่ใช่ click) เพื่อเลือกก่อน input เสีย focus
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              className={`px-3 py-2 text-sm cursor-pointer break-words ${i === active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
