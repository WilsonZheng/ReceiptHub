import MiniSearch from 'minisearch';
import type { Receipt } from './types';

type Doc = { id: string; merchant: string; note: string; category: string; amount: string };

const toDoc = (r: Receipt): Doc => ({
  id: r.id,
  merchant: r.merchant,
  note: r.note ?? '',
  category: r.category,
  amount: `${(r.totalCents / 100).toFixed(2)} ${Math.round(r.totalCents / 100)}`,
});

export function buildIndex(receipts: Receipt[]): MiniSearch<Doc> {
  const idx = new MiniSearch<Doc>({
    fields: ['merchant', 'note', 'category', 'amount'],
    searchOptions: { fuzzy: 0.25, prefix: true },
  });
  idx.addAll(receipts.filter((r) => !r.deleted).map(toDoc));
  return idx;
}

export function searchReceipts(idx: MiniSearch<Doc>, query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  return idx.search(q).map((r) => String(r.id));
}
