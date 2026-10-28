import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { receiptsToCsv, summarize } from './csv';

const rec = (extra: Partial<Receipt>): Receipt => ({
  id: '01J',
  space: 'company',
  kind: 'expense',
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
  it('emits header and rows with kind, items and net = total - gst', () => {
    const csv = receiptsToCsv([rec({})]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe(
      'Date,Kind,Merchant,Items,Category,Net (NZD),GST (NZD),Total (NZD),Note,Original receipt,ReceiptID',
    );
    expect(row).toBe('2026-06-07,Expense,Bunnings,,Equipment,160.43,24.07,184.50,,Missing,01J');
  });
  it('marks records that have a photo or PDF attached', () => {
    const csv = receiptsToCsv([rec({ photos: [{ id: 'p', kind: 'pdf' }] })]);
    expect(csv).toContain(',Attached,01J');
  });
  it('joins items with semicolons', () => {
    const csv = receiptsToCsv([rec({ items: ['Timber 2.4m ×6', 'Screws box'] })]);
    expect(csv).toContain(',Timber 2.4m ×6; Screws box,');
  });
  it('legacy records without kind default to Expense; income labelled Income', () => {
    const csv = receiptsToCsv([rec({ kind: undefined }), rec({ id: '01K', kind: 'income' })]);
    const [, row1, row2] = csv.trim().split('\n');
    expect(row1).toContain(',Expense,');
    expect(row2).toContain(',Income,');
  });
  it('escapes quotes and commas', () => {
    const csv = receiptsToCsv([rec({ merchant: 'A "B", C', note: 'x,y' })]);
    expect(csv).toContain('"A ""B"", C"');
    expect(csv).toContain('"x,y"');
  });
});

describe('summarize (per-kind totals)', () => {
  it('splits income and expense with per-category subtotals', () => {
    const s = summarize([
      rec({}), // expense 184.50 / gst 24.07
      rec({ id: '01K', totalCents: 11500, gstCents: 1500, category: 'Fuel' }), // expense
      rec({ id: '01L', kind: 'income', totalCents: 230000, gstCents: 30000, category: 'Sales' }),
    ]);
    expect(s.expense.count).toBe(2);
    expect(s.expense.totalCents).toBe(29950);
    expect(s.expense.gstCents).toBe(3907);
    expect(s.expense.byCategory).toEqual({ Equipment: 18450, Fuel: 11500 });
    expect(s.income.count).toBe(1);
    expect(s.income.totalCents).toBe(230000);
    expect(s.income.gstCents).toBe(30000);
    expect(s.income.byCategory).toEqual({ Sales: 230000 });
  });
  it('treats legacy kind-less records as expense', () => {
    const s = summarize([rec({ kind: undefined })]);
    expect(s.expense.count).toBe(1);
    expect(s.income.count).toBe(0);
  });
});

describe('receiptsToCsv spreadsheet safety', () => {
  it('neutralises text that a spreadsheet would run as a formula', () => {
    const csv = receiptsToCsv([
      rec({ merchant: '=HYPERLINK("http://x","y")', note: '-1+1', items: ['@SUM(A1)'] }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain(",'-1+1,");
    expect(csv).toContain(",'@SUM(A1),");
  });
  it('quotes a bare carriage return', () => {
    expect(receiptsToCsv([rec({ note: 'a\rb' })])).toContain('"a\rb"');
  });
});
