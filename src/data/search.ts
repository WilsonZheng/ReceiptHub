import MiniSearch from 'minisearch';
import type { Receipt } from './types';

type Doc = {
  id: string;
  merchant: string;
  note: string;
  category: string;
  items: string;
  amount: string;
};

const toDoc = (r: Receipt): Doc => ({
  id: r.id,
  merchant: r.merchant,
  note: r.note ?? '',
  category: r.category,
  items: (r.items ?? []).join(' '),
  amount: `${(r.totalCents / 100).toFixed(2)} ${Math.round(r.totalCents / 100)}`,
});

export function buildIndex(receipts: Receipt[]): MiniSearch<Doc> {
  const idx = new MiniSearch<Doc>({
    fields: ['merchant', 'note', 'category', 'items', 'amount'],
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
