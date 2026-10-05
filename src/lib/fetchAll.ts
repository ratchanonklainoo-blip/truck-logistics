// ดึงทุกแถวแบบแบ่งหน้า (.range) — PostgREST ตัดที่ 1000 แถวต่อคำขอโดยไม่แจ้ง
// build ต้องมี .order() ที่ลำดับคงที่ (เช่นปิดท้ายด้วย .order('id')) ไม่งั้นแถวอาจซ้ำ/หายระหว่างหน้า
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PageResult<T>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) return { data: all, error: null };
  }
}
