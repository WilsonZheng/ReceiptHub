import { describe, expect, it } from 'vitest';
import type { Receipt } from './types';
import { buildIndex, searchReceipts } from './search';

const rec = (id: string, extra: Partial<Receipt>): Receipt => ({
  id,
  space: 'company',
  date: '2026-06-07',
  merchant: 'M',
  totalCents: 18450,
  gstCents: 2407,
  category: 'Other',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

const docs = [
  rec('1', { merchant: 'Bunnings Warehouse', category: 'Equipment' }),
  rec('2', { merchant: 'Z Energy Penrose', category: 'Fuel', note: 'trip to Hamilton' }),
  rec('3', { merchant: 'JB Hi-Fi', totalCents: 129900 }),
];

describe('searchReceipts', () => {
  const idx = buildIndex(docs);
  it('matches merchant with typo (fuzzy)', () =>
    expect(searchReceipts(idx, 'bunings')).toContain('1'));
  it('matches note words', () => expect(searchReceipts(idx, 'hamilton')).toContain('2'));
  it('matches category prefix', () => expect(searchReceipts(idx, 'equip')).toContain('1'));
  it('matches amount string', () => expect(searchReceipts(idx, '1299')).toContain('3'));
  it('empty query returns empty', () => expect(searchReceipts(idx, '  ')).toEqual([]));
  it('matches item names', () => {
    const idx2 = buildIndex([rec('5', { merchant: 'Shop', items: ['Pine Timber ×6', 'Screws'] })]);
    expect(searchReceipts(idx2, 'timber')).toContain('5');
  });
  it('excludes tombstones from index', () => {
    const idx2 = buildIndex([...docs, rec('4', { merchant: 'Deleted Shop', deleted: true })]);
    expect(searchReceipts(idx2, 'deleted shop')).not.toContain('4');
  });
});
