import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filedGstPeriodOf, nextOpenGstPeriod, setTaskDone } from './taxState';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
beforeEach(() => mem.clear());

describe('filed GST periods', () => {
  it('a date is in a filed period only after that return is marked done', () => {
    // 默认每半年申报：4–9 月一期，9 月结束
    expect(filedGstPeriodOf('2026-08-30')).toBeNull();
    setTaskDone('gst:2026-09', true);
    expect(filedGstPeriodOf('2026-08-30')).toMatchObject({ from: '2026-04-01', to: '2026-09-30' });
    expect(filedGstPeriodOf('2026-10-02')).toBeNull();
  });

  it('a late receipt moves to the first period that is not filed yet', () => {
    setTaskDone('gst:2026-03', true);
    setTaskDone('gst:2026-09', true);
    expect(nextOpenGstPeriod('2026-02-14').from).toBe('2026-10-01');
    expect(nextOpenGstPeriod('2026-08-30').from).toBe('2026-10-01');
  });

  it('follows the filing frequency', () => {
    localStorage.setItem('rh.gst.freq', 'two-even');
    setTaskDone('gst:2026-08', true);
    expect(filedGstPeriodOf('2026-07-15')).toMatchObject({ from: '2026-07-01', to: '2026-08-31' });
    expect(nextOpenGstPeriod('2026-07-15').from).toBe('2026-09-01');
  });
});
