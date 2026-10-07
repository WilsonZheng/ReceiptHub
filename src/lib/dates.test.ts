import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, formatMonthRange, localToday } from './dates';

describe('formatDate', () => {
  it('zh uses 年月日', () => {
    const s = formatDate('2026-06-07', 'zh');
    expect(s).toContain('2026');
    expect(s).toContain('月');
    expect(s).toContain('7');
  });
  it('en is short and readable', () => {
    const s = formatDate('2026-06-07', 'en');
    expect(s).toMatch(/7/);
    expect(s).toMatch(/Jun/i);
    expect(s).toContain('2026');
  });
});

describe('formatMonth', () => {
  it('zh', () => expect(formatMonth('2026-06', 'zh')).toContain('6月'));
  it('en', () => expect(formatMonth('2026-06', 'en')).toMatch(/June 2026/));
});

describe('invalid date safety', () => {
  it('formatDate returns raw string instead of throwing', () => {
    expect(formatDate('2026-07-00', 'en')).toBe('2026-07-00');
  });
  it('formatMonth returns raw string instead of throwing', () => {
    expect(formatMonth('not-a-month', 'zh')).toBe('not-a-month');
  });
});

describe('localToday', () => {
  it('uses LOCAL date parts, not UTC (NZ 上午 UTC 还是昨天)', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    expect(localToday()).toBe(expected);
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatMonthRange', () => {
  it('same year shares the year', () => {
    expect(formatMonthRange('2026-09', '2026-10', 'zh')).toBe('2026年9月–10月');
    expect(formatMonthRange('2026-09', '2026-10', 'en')).toBe('Sep – Oct 2026');
  });
  it('cross-year spells out both years', () => {
    expect(formatMonthRange('2026-12', '2027-01', 'zh')).toBe('2026年12月–2027年1月');
    expect(formatMonthRange('2026-10', '2027-03', 'en')).toBe('Oct 2026 – Mar 2027');
  });
});
