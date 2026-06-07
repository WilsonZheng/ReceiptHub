import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, localToday } from './dates';

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
