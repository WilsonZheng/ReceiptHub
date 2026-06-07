import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { mergeReceipts, monthKey, monthPath } from './merge';

const r = (id: string, updatedAt: string, extra: Partial<Receipt> = {}): Receipt => ({
  id,
  space: 'company',
  date: '2026-06-07',
  merchant: 'M',
  totalCents: 100,
  gstCents: 13,
  category: 'Other',
  photos: [],
  createdAt: '2026-06-07T00:00:00Z',
  updatedAt,
  ...extra,
});

describe('monthKey / monthPath', () => {
  it('extracts YYYY-MM', () => expect(monthKey('2026-06-07')).toBe('2026-06'));
  it('builds repo path', () =>
    expect(monthPath('company', '2026-06-07')).toBe('company/2026-06.json'));
});

describe('mergeReceipts (LWW by updatedAt, union by id)', () => {
  it('unions disjoint sets', () => {
    const out = mergeReceipts([r('a', '2026-06-01T00:00:00Z')], [r('b', '2026-06-02T00:00:00Z')]);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
  it('newer updatedAt wins', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z', { merchant: 'OLD' })],
      [r('a', '2026-06-03T00:00:00Z', { merchant: 'NEW' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].merchant).toBe('NEW');
  });
  it('tombstone survives merge', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z')],
      [r('a', '2026-06-03T00:00:00Z', { deleted: true })],
    );
    expect(out[0].deleted).toBe(true);
  });
  it('older edit does not resurrect tombstone', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-05T00:00:00Z', { deleted: true })],
      [r('a', '2026-06-02T00:00:00Z', { merchant: 'STALE' })],
    );
    expect(out[0].deleted).toBe(true);
  });
  it('output sorted by date desc then id', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z', { date: '2026-06-01' })],
      [r('b', '2026-06-01T00:00:00Z', { date: '2026-06-09' })],
    );
    expect(out[0].id).toBe('b');
  });
});
