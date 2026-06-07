import { kindOf, type Receipt } from '../data/types';

const esc = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const money = (cents: number): string => (cents / 100).toFixed(2);

export function receiptsToCsv(receipts: Receipt[]): string {
  const header = 'Date,Kind,Merchant,Category,Net (NZD),GST (NZD),Total (NZD),Note,ReceiptID';
  const rows = receipts.map((r) =>
    [
      r.date,
      kindOf(r) === 'income' ? 'Income' : 'Expense',
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

export interface KindTotals {
  count: number;
  totalCents: number;
  gstCents: number;
  byCategory: Record<string, number>;
}

export interface Summary {
  expense: KindTotals;
  income: KindTotals;
}

const empty = (): KindTotals => ({ count: 0, totalCents: 0, gstCents: 0, byCategory: {} });

export function summarize(receipts: Receipt[]): Summary {
  const s: Summary = { expense: empty(), income: empty() };
  for (const r of receipts) {
    const side = s[kindOf(r)];
    side.count++;
    side.totalCents += r.totalCents;
    side.gstCents += r.gstCents;
    side.byCategory[r.category] = (side.byCategory[r.category] ?? 0) + r.totalCents;
  }
  return s;
}
