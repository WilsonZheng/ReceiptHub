import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, weekdayLabels } from './calendar';

describe('monthGrid', () => {
  it('june 2026 starts exactly on monday jun 1', () => {
    const g = monthGrid('2026-06');
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-06-01');
    expect(g).toContain('2026-06-30');
    expect(g[41]).toBe('2026-07-12');
  });
  it('august 2026 (starts saturday) pads back to monday jul 27', () => {
    const g = monthGrid('2026-08');
    expect(g[0]).toBe('2026-07-27');
    expect(g[5]).toBe('2026-08-01');
    expect(g).toContain('2026-08-31');
  });
});

describe('addMonths', () => {
  it('forward', () => expect(addMonths('2026-06', 1)).toBe('2026-07'));
  it('back across year', () => expect(addMonths('2026-01', -1)).toBe('2025-12'));
  it('forward across year', () => expect(addMonths('2026-12', 1)).toBe('2027-01'));
});

describe('weekdayLabels', () => {
  it('zh is 一二三四五六日', () => expect(weekdayLabels('zh').join('')).toBe('一二三四五六日'));
  it('en starts with M', () => expect(weekdayLabels('en')[0]).toMatch(/^M/i));
});
