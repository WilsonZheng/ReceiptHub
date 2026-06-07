import type { Receipt } from '../data/types';

const esc = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const money = (cents: number): string => (cents / 100).toFixed(2);

export function receiptsToCsv(receipts: Receipt[]): string {
  const header = 'Date,Merchant,Category,Net (NZD),GST (NZD),Total (NZD),Note,ReceiptID';
  const rows = receipts.map((r) =>
    [
      r.date,
      esc(r.merchant),
      esc(r.category),
      money(r.totalCents - r.gstCents),
      money(r.gstCents),
      money(r.totalCents),
      esc(r.note ?? ''),
      r.id,
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

export interface Summary {
  count: number;
  totalCents: number;
  gstCents: number;
  netCents: number;
  byCategory: Record<string, number>;
}

export function summarize(receipts: Receipt[]): Summary {
  const s: Summary = { count: 0, totalCents: 0, gstCents: 0, netCents: 0, byCategory: {} };
  for (const r of receipts) {
    s.count++;
    s.totalCents += r.totalCents;
    s.gstCents += r.gstCents;
    s.byCategory[r.category] = (s.byCategory[r.category] ?? 0) + r.totalCents;
  }
  s.netCents = s.totalCents - s.gstCents;
  return s;
}
