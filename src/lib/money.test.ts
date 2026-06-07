import { describe, expect, it } from 'vitest';
import { formatNZD, gstFromTotalCents, parseNZD } from './money';

describe('gstFromTotalCents (NZ GST = total × 3/23)', () => {
  it.each([
    [11500, 1500], // $115.00 → $15.00
    [18450, 2407], // $184.50 → $24.07（四舍五入）
    [9230, 1204], // $92.30 → $12.04
    [23, 3],
    [100, 13], // 13.04… → 13
    [0, 0],
  ])('%i cents → %i cents', (total, gst) => {
    expect(gstFromTotalCents(total)).toBe(gst);
  });
});

describe('parseNZD', () => {
  it('parses dollars to cents', () => expect(parseNZD('184.50')).toBe(18450));
  it('accepts $ and commas', () => expect(parseNZD('$1,299.00')).toBe(129900));
  it('accepts bare integers', () => expect(parseNZD('92')).toBe(9200));
  it('rejects garbage', () => expect(parseNZD('abc')).toBeNull());
  it('rejects negatives', () => expect(parseNZD('-5')).toBeNull());
});

describe('formatNZD', () => {
  it('formats cents', () => expect(formatNZD(129900)).toBe('$1,299.00'));
  it('formats zero', () => expect(formatNZD(0)).toBe('$0.00'));
});
