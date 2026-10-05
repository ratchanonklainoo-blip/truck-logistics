// ปิดงานได้เมื่อยอดรับรวม >= ราคาขาย (เทียบเป็นสตางค์ กันทศนิยมคลาด)
export function isFullyPaid(totalPaid: number, sellingPrice: number): boolean {
  return Math.round(totalPaid * 100) >= Math.round(sellingPrice * 100);
}
