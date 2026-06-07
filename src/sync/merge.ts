import type { Receipt, Space } from '../data/types';

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthPath(space: Space, date: string): string {
  return `${space}/${monthKey(date)}.json`;
}

export function mergeReceipts(a: Receipt[], b: Receipt[]): Receipt[] {
  const byId = new Map<string, Receipt>();
  for (const rec of [...a, ...b]) {
    const existing = byId.get(rec.id);
    if (!existing || rec.updatedAt > existing.updatedAt) byId.set(rec.id, rec);
  }
  return [...byId.values()].sort((x, y) =>
    x.date === y.date ? (x.id < y.id ? 1 : -1) : x.date < y.date ? 1 : -1,
  );
}
