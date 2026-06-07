import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { receiptsToCsv, summarize } from './csv';

const rec = (extra: Partial<Receipt>): Receipt => ({
  id: '01J',
  space: 'company',
  date: '2026-06-07',
  merchant: 'Bunnings',
  totalCents: 18450,
  gstCents: 2407,
  category: 'Equipment',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('receiptsToCsv', () => {
  it('emits header and rows with net = total - gst', () => {
    const csv = receiptsToCsv([rec({})]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('Date,Merchant,Category,Net (NZD),GST (NZD),Total (NZD),Note,ReceiptID');
    expect(row).toBe('2026-06-07,Bunnings,Equipment,160.43,24.07,184.50,,01J');
  });
  it('escapes quotes and commas', () => {
    const csv = receiptsToCsv([rec({ merchant: 'A "B", C', note: 'x,y' })]);
    expect(csv).toContain('"A ""B"", C"');
    expect(csv).toContain('"x,y"');
  });
});

describe('summarize', () => {
  it('totals and per-category subtotals', () => {
    const s = summarize([
      rec({}),
      rec({ id: '01K', totalCents: 11500, gstCents: 1500, category: 'Fuel' }),
    ]);
    expect(s.count).toBe(2);
    expect(s.totalCents).toBe(29950);
    expect(s.gstCents).toBe(3907);
    expect(s.netCents).toBe(26043);
    expect(s.byCategory).toEqual({ Equipment: 18450, Fuel: 11500 });
  });
});
