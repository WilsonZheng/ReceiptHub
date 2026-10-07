import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { gstFromTotalCents } from './money';
import { gstReturn } from './gst';

const rec = (totalCents: number, extra: Partial<Receipt> = {}): Receipt => ({
  id: String(Math.random()),
  space: 'company',
  kind: 'expense',
  date: '2026-10-01',
  merchant: 'M',
  totalCents,
  gstCents: gstFromTotalCents(totalCents),
  category: 'Other',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('gstReturn', () => {
  it('fills myIR boxes: sales, purchases, and the net to pay', () => {
    const r = gstReturn([
      rec(23000, { kind: 'income', category: 'Sales' }), // GST 30.00
      rec(11500), // GST 15.00
    ]);
    expect(r).toEqual({ box5: 23000, box6: 0, box8: 3000, box11: 11500, box12: 1500, box15: 1500 });
  });

  it('computes GST from the box total (IRD method), not the sum of rounded receipts', () => {
    // 两张 $10：逐张 GST 1.30 + 1.30 = 2.60；IRD 按 $20 × 3/23 = 2.61
    expect(gstReturn([rec(1000), rec(1000)]).box12).toBe(261);
  });

  it('no-GST income is zero-rated, interest is exempt, no-GST purchases are left out', () => {
    const r = gstReturn([
      rec(50000, { kind: 'income', category: 'Services', gstCents: 0 }), // 出口服务，零税率
      rec(1200, { kind: 'income', category: 'Interest', gstCents: 0 }), // 免税
      rec(800, { gstCents: 0 }), // 银行手续费等无 GST 支出
    ]);
    expect(r).toMatchObject({ box5: 50000, box6: 50000, box8: 0, box11: 0, box12: 0 });
  });

  it('refund when purchases exceed sales; ignores personal and deleted receipts', () => {
    const r = gstReturn([
      rec(23000),
      rec(23000, { space: 'personal', gstCents: 0 }),
      rec(23000, { deleted: true }),
    ]);
    expect(r.box15).toBe(-3000);
  });
});
