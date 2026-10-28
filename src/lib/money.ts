export function gstFromTotalCents(totalCents: number): number {
  // NZ GST 15%：含税价的 GST 部分 = total × 15/115 = total × 3/23
  return Math.round((totalCents * 3) / 23);
}

export function parseNZD(input: string): number | null {
  const s = input.replace(/[$\s]/g, '');
  // 千分位只认标准写法（1,234,567）；整数部分最多 9 位，免得超出安全整数
  const ok = /^(\d{1,9}|\d{1,3}(,\d{3}){1,2})?(\.\d{0,2})?$/.test(s) && /\d/.test(s);
  if (!ok) return null;
  return Math.round(parseFloat(s.replace(/,/g, '') || '0') * 100);
}

export function formatNZD(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-NZ');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
