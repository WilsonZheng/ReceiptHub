import MiniSearch from 'minisearch';
import { categoryLabel } from '../lib/categories';
import type { Receipt } from './types';

type Doc = {
  id: string;
  merchant: string;
  note: string;
  category: string;
  items: string;
  date: string;
  amount: string;
};

const toDoc = (r: Receipt): Doc => ({
  id: r.id,
  merchant: r.merchant,
  note: r.note ?? '',
  // 同时索引英文规范名和中文标签——两种语言都能搜到
  category: `${r.category} ${categoryLabel(r.category, 'zh')}`,
  items: (r.items ?? []).join(' '),
  date: r.date,
  // 总额（元/整数元）+ GST 金额都可搜
  amount: `${(r.totalCents / 100).toFixed(2)} ${Math.round(r.totalCents / 100)} ${(r.gstCents / 100).toFixed(2)}`,
});

export function buildIndex(receipts: Receipt[]): MiniSearch<Doc> {
  const idx = new MiniSearch<Doc>({
    fields: ['merchant', 'note', 'category', 'items', 'date', 'amount'],
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
