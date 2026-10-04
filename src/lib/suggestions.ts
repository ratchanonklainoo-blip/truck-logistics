// รวมรายการแนะนำ (สถานที่/สินค้า) จากหลายแหล่ง ไม่ซ้ำ เรียงสำหรับค้นหา
// ซ้ำ = เท่ากันหลัง trim และไม่สนตัวพิมพ์เล็กใหญ่ (เก็บรูปแบบที่เจอก่อน)

export function mergeSuggestions(...sources: (readonly (string | null | undefined)[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of sources) {
    for (const raw of src) {
      const v = (raw ?? '').trim();
      if (!v || v === '-') continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'th'));
}

// กรองตามข้อความที่พิมพ์: ขึ้นต้นด้วยคำที่พิมพ์ก่อน แล้วค่อยที่มีคำนั้นอยู่ตรงกลาง
export function filterSuggestions(options: readonly string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of options) {
    const l = o.toLowerCase();
    if (l.startsWith(q)) starts.push(o);
    else if (l.includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}
