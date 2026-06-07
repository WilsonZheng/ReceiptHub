export function gstFromTotalCents(totalCents: number): number {
  // NZ GST 15%：含税价的 GST 部分 = total × 15/115 = total × 3/23
  return Math.round((totalCents * 3) / 23);
}

export function parseNZD(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function formatNZD(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-NZ');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
