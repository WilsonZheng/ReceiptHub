import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { gstFromTotalCents } from './money';
import { receiptChecks } from './checks';
import { entertainmentAdjustment } from './gst';
import { buildIcs } from './ics';

const rec = (id: string, totalCents: number, extra: Partial<Receipt> = {}): Receipt => ({
  id,
  space: 'company',
  kind: 'expense',
  date: '2026-10-01',
  merchant: 'Z Energy',
  totalCents,
  gstCents: gstFromTotalCents(totalCents),
  category: 'Other',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('receiptChecks', () => {
  it('flags duplicates, missing GST on usually-taxed categories, and invoices over $1,000', () => {
    const checks = receiptChecks(
      [
        rec('a', 9230),
        rec('b', 9230, { merchant: 'z energy ' }), // 同日同额同商家（大小写/空格不同）
        rec('c', 5000, { category: 'Fuel', gstCents: 0, merchant: 'BP' }),
        rec('d', 189900, { merchant: 'Noel Leeming' }),
        rec('e', 500, { category: 'Other', gstCents: 0, merchant: 'Bank' }), // 银行费本就无 GST
        rec('f', 189900, { merchant: 'Old', date: '2024-01-01' }), // 早于检查范围
      ],
      '2025-04-01',
    );
    expect(checks.map((c) => c.id)).toEqual(['duplicate:a,b', 'noGst:c', 'bigInvoice:d']);
  });

  it('ignores personal space and deleted receipts', () => {
    expect(
      receiptChecks(
        [
          rec('a', 200000, { space: 'personal', gstCents: 0, category: 'Fuel' }),
          rec('b', 200000, { deleted: true }),
        ],
        '2025-04-01',
      ),
    ).toEqual([]);
  });
});

describe('entertainmentAdjustment', () => {
  it('adds back half of the GST on entertainment', () => {
    expect(
      entertainmentAdjustment([
        rec('a', 23000, { category: 'Meals & Entertainment' }), // GST 30.00 → 加回 15.00
        rec('b', 23000), // 其他分类不计
      ]),
    ).toBe(1500);
  });
});

describe('buildIcs', () => {
  it('writes all-day events with two reminders and escapes text', () => {
    const ics = buildIcs(
      [{ uid: 'gst:2026-09', date: '2026-10-28', title: 'GST, Apr–Sep', description: 'a;b' }],
      '2026-10-07',
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261028\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261029\r\n');
    expect(ics).toContain('SUMMARY:GST\\, Apr–Sep\r\n');
    expect(ics).toContain('DESCRIPTION:a\;b\r\n');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });
});
