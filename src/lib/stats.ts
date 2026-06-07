import { kindOf, type Receipt } from '../data/types';

export interface MonthAgg {
  month: string; // YYYY-MM
  expenseCents: number;
  incomeCents: number;
}

/** 最近 N 个自然月（含本月），老→新，按收支分桶 */
export function aggregateByMonth(
  receipts: Receipt[],
  months: number,
  todayIso: string,
): MonthAgg[] {
  const [y, m] = todayIso.slice(0, 7).split('-').map(Number);
  const list: MonthAgg[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    list.push({ month, expenseCents: 0, incomeCents: 0 });
  }
  const idx = new Map(list.map((e, i) => [e.month, i]));
  for (const r of receipts) {
    if (r.deleted) continue;
    const i = idx.get(r.date.slice(0, 7));
    if (i === undefined) continue;
    if (kindOf(r) === 'income') list[i].incomeCents += r.totalCents;
    else list[i].expenseCents += r.totalCents;
  }
  return list;
}

/** 按 key 聚合 totalCents，降序取前 top 名 */
export function topBy(
  receipts: Receipt[],
  key: (r: Receipt) => string,
  top: number,
): [string, number][] {
  const sums = new Map<string, number>();
  for (const r of receipts) {
    if (r.deleted) continue;
    sums.set(key(r), (sums.get(key(r)) ?? 0) + r.totalCents);
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}

/** 环比百分比（四舍五入整数）；基期为 0 时返回 null */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
