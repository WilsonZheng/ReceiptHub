import { describe, expect, it } from 'vitest';
import { fyName, gstDueDate, incomeTaxDueDate, periodAt, periodOffsetOf } from './periods';

describe('periodAt', () => {
  it('NZ tax year runs 1 Apr – 31 Mar', () => {
    expect(periodAt('2026-10-07', 'fy', 'two-odd')).toMatchObject({
      from: '2026-04-01',
      to: '2027-03-31',
      months: 12,
    });
    // 3 月底仍属上一财年，4 月 1 日进入新财年
    expect(periodAt('2026-03-31', 'fy', 'two-odd').from).toBe('2025-04-01');
    expect(periodAt('2026-04-01', 'fy', 'two-odd').from).toBe('2026-04-01');
  });

  it('steps to last / next tax year by offset', () => {
    expect(periodAt('2026-10-07', 'fy', 'two-odd', -1)).toMatchObject({
      from: '2025-04-01',
      to: '2026-03-31',
    });
    expect(periodAt('2026-10-07', 'fy', 'two-odd', 1)).toMatchObject({
      from: '2027-04-01',
      to: '2028-03-31',
    });
  });

  it('two-monthly GST periods ending in odd months', () => {
    expect(periodAt('2026-10-07', 'gst', 'two-odd')).toMatchObject({
      from: '2026-10-01',
      to: '2026-11-30',
    });
    expect(periodAt('2026-09-30', 'gst', 'two-odd')).toMatchObject({
      from: '2026-08-01',
      to: '2026-09-30',
    });
    // 12–1 月跨年
    expect(periodAt('2026-12-15', 'gst', 'two-odd')).toMatchObject({
      from: '2026-12-01',
      to: '2027-01-31',
    });
  });

  it('two-monthly GST periods ending in even months', () => {
    expect(periodAt('2026-10-07', 'gst', 'two-even')).toMatchObject({
      from: '2026-09-01',
      to: '2026-10-31',
    });
    expect(periodAt('2026-01-10', 'gst', 'two-even', -1)).toMatchObject({
      from: '2025-11-01',
      to: '2025-12-31',
    });
  });

  it('six-monthly GST ends Mar and Sep; monthly is the calendar month', () => {
    expect(periodAt('2026-10-07', 'gst', 'six')).toMatchObject({
      from: '2026-10-01',
      to: '2027-03-31',
    });
    expect(periodAt('2026-09-30', 'gst', 'six').from).toBe('2026-04-01');
    expect(periodAt('2024-02-10', 'gst', 'monthly')).toMatchObject({
      from: '2024-02-01',
      to: '2024-02-29', // 闰年
    });
  });

  it('month and calendar year modes', () => {
    expect(periodAt('2026-01-07', 'month', 'two-odd', -1)).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(periodAt('2026-10-07', 'year', 'two-odd')).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });
});

describe('periodOffsetOf', () => {
  it('counts whole periods between a date and today', () => {
    expect(periodOffsetOf('2025-05-01', '2026-10-07', 'fy', 'two-odd')).toBe(-1);
    expect(periodOffsetOf('2027-04-02', '2026-10-07', 'fy', 'two-odd')).toBe(1);
    expect(periodOffsetOf('2026-07-31', '2026-10-07', 'gst', 'two-odd')).toBe(-2);
    expect(periodOffsetOf('2026-10-31', '2026-10-07', 'month', 'two-odd')).toBe(0);
  });
});

describe('gstDueDate', () => {
  it('28th of the following month', () => {
    expect(gstDueDate('2026-09')).toBe('2026-10-28');
    expect(gstDueDate('2026-12')).toBe('2027-01-28');
  });
  it('March → 7 May, November → 15 January', () => {
    expect(gstDueDate('2027-03')).toBe('2027-05-07');
    expect(gstDueDate('2026-11')).toBe('2027-01-15');
  });
});

describe('tax year helpers', () => {
  it('names the year and the income tax return due date', () => {
    expect(fyName('2027-03')).toBe('2026–27');
    expect(incomeTaxDueDate('2027-03')).toBe('2027-07-07');
  });
});
