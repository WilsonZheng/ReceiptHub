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

describe('parseNZD edge cases', () => {
  it('accepts shorthand decimals', () => {
    expect(parseNZD('.5')).toBe(50);
    expect(parseNZD('12.')).toBe(1200);
  });
  it('accepts proper thousands separators only', () => {
    expect(parseNZD('1,234.50')).toBe(123450);
    expect(parseNZD('12,345,678')).toBe(1234567800);
    expect(parseNZD('1,2,3')).toBeNull();
    expect(parseNZD('12,34')).toBeNull();
  });
  it('rejects absurd lengths instead of producing unsafe integers', () => {
    expect(parseNZD('99999999999999999')).toBeNull();
    expect(parseNZD('999999999.99')).toBe(99999999999);
  });
});
