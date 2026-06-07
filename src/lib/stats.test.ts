import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { aggregateByMonth, pctChange, topBy } from './stats';

const rec = (date: string, totalCents: number, extra: Partial<Receipt> = {}): Receipt => ({
  id: date + totalCents,
  space: 'company',
  kind: 'expense',
  date,
  merchant: 'M',
  totalCents,
  gstCents: 0,
  category: 'Other',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('aggregateByMonth', () => {
  it('returns last N months oldest→newest with expense/income split', () => {
    const out = aggregateByMonth(
      [
        rec('2026-06-01', 100),
        rec('2026-05-15', 200, { kind: 'income' }),
        rec('2026-03-01', 50), // 窗口外
      ],
      3,
      '2026-06-07',
    );
    expect(out.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(out[2].expenseCents).toBe(100);
    expect(out[1].incomeCents).toBe(200);
    expect(out[0]).toEqual({ month: '2026-04', expenseCents: 0, incomeCents: 0 });
  });
  it('skips tombstones and treats kind-less as expense', () => {
    const out = aggregateByMonth(
      [rec('2026-06-01', 100, { deleted: true }), rec('2026-06-02', 70, { kind: undefined })],
      1,
      '2026-06-07',
    );
    expect(out[0].expenseCents).toBe(70);
  });
  it('handles year boundary', () => {
    const out = aggregateByMonth([], 3, '2026-01-15');
    expect(out.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('topBy', () => {
  it('sums by key, sorts desc, limits', () => {
    const out = topBy(
      [
        rec('2026-06-01', 100, { category: 'Fuel' }),
        rec('2026-06-02', 300, { category: 'Equipment' }),
        rec('2026-06-03', 50, { category: 'Fuel' }),
        rec('2026-06-04', 10, { category: 'Parking' }),
      ],
      (r) => r.category,
      2,
    );
    expect(out).toEqual([
      ['Equipment', 300],
      ['Fuel', 150],
    ]);
  });
});

describe('pctChange', () => {
  it('computes rounded percent', () => expect(pctChange(150, 100)).toBe(50));
  it('negative', () => expect(pctChange(50, 100)).toBe(-50));
  it('null when no baseline', () => expect(pctChange(10, 0)).toBeNull());
});
