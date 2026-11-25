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

// 每个索引对应的原文（小写拼成一串），给"包含这几个字"的匹配用
const haystacks = new WeakMap<MiniSearch<Doc>, { id: string; text: string }[]>();

export function buildIndex(receipts: Receipt[]): MiniSearch<Doc> {
  const idx = new MiniSearch<Doc>({
    fields: ['merchant', 'note', 'category', 'items', 'date', 'amount'],
    // 多个词要同时命中：搜"bunnings drill"是在缩小范围，不是把带 drill 的全拉进来
    searchOptions: { fuzzy: 0.25, prefix: true, combineWith: 'AND' },
  });
  const docs = receipts.filter((r) => !r.deleted).map(toDoc);
  idx.addAll(docs);
  haystacks.set(
    idx,
    docs.map((d) => ({
      id: d.id,
      text: [d.merchant, d.note, d.category, d.items, d.date, d.amount].join('\n').toLowerCase(),
    })),
  );
  return idx;
}

export function searchReceipts(idx: MiniSearch<Doc>, query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const ids = idx.search(q).map((r) => String(r.id));
  // 分词搜索只认整词和词头：中文没有空格，"奥克兰五金超市"搜"超市"搜不到，
  // "Hardware"搜"ware"也搜不到——再补一遍"原文里包含这几个字"
  const needle = q.toLowerCase();
  const seen = new Set(ids);
  for (const h of haystacks.get(idx) ?? []) {
    if (!seen.has(h.id) && h.text.includes(needle)) ids.push(h.id);
  }
  return ids;
}
