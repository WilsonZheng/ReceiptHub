import { describe, expect, it } from 'vitest';
import { daysBetween, taxTasks, urgencyOf, type TaxProfile } from './taxCalendar';

const base: TaxProfile = {
  gstFreq: 'six',
  hasAgent: false,
  provisional: 'no',
  payeEmployer: false,
  annualReturnMonth: null,
};
const dues = (p: TaxProfile, today = '2026-10-07', ahead = 400) =>
  taxTasks(p, today, { backDays: 0, aheadDays: ahead }).map((t) => `${t.id}@${t.due}`);

describe('taxTasks', () => {
  it('six-monthly GST + income tax without an agent', () => {
    expect(dues(base)).toEqual([
      'gst:2026-09@2026-10-28', // 4–9 月这一期
      'terminalTax:2026@2027-02-07', // 2025–26 财年年终税
      'gst:2027-03@2027-05-07', // 10–3 月这一期
      'incomeTax:2027@2027-07-07', // 2026–27 财年所得税申报
      'gst:2027-09@2027-10-28',
    ]);
  });

  it('tax agent extends the return to 31 Mar and terminal tax to 7 Apr', () => {
    const out = dues({ ...base, hasAgent: true });
    expect(out).toContain('incomeTax:2026@2027-03-31');
    expect(out).toContain('terminalTax:2026@2027-04-07');
    expect(out.some((s) => s.startsWith('incomeTax:2027'))).toBe(false); // 延到 2028-03-31，窗口外
  });

  it('two-monthly GST periods and the November → 15 January exception', () => {
    const out = dues({ ...base, gstFreq: 'two-odd' }, '2026-10-07', 120);
    expect(out).toContain('gst:2026-09@2026-10-28');
    expect(out).toContain('gst:2026-11@2027-01-15');
  });

  it('provisional tax: 2 instalments for six-monthly GST, 3 otherwise', () => {
    const six = dues({ ...base, provisional: 'standard' }).filter((s) =>
      s.startsWith('provisional'),
    );
    expect(six).toEqual([
      'provisional:2027:1@2026-10-28',
      'provisional:2027:2@2027-05-07',
      'provisional:2028:1@2027-10-28',
    ]);
    const two = dues({ ...base, gstFreq: 'two-odd', provisional: 'standard' }).filter((s) =>
      s.startsWith('provisional:2027'),
    );
    expect(two).toEqual(['provisional:2027:2@2027-01-15', 'provisional:2027:3@2027-05-07']);
  });

  it('PAYE on the 20th of the next month, annual return at month end', () => {
    const out = dues({ ...base, payeEmployer: true, annualReturnMonth: 2 }, '2026-10-07', 60);
    expect(out).toContain('paye:2026-09@2026-10-20');
    expect(out).toContain('paye:2026-10@2026-11-20');
    const ar = dues({ ...base, annualReturnMonth: 2 }).filter((s) => s.startsWith('annual'));
    expect(ar).toEqual(['annualReturn:2027@2027-02-28']);
  });

  it('includes recently missed deadlines in the look-back window', () => {
    const out = taxTasks(base, '2026-11-10', { backDays: 60, aheadDays: 10 }).map((t) => t.id);
    expect(out).toEqual(['gst:2026-09']);
  });
});

describe('urgency', () => {
  it('overdue, within 14 days, later', () => {
    expect(daysBetween('2026-10-07', '2026-10-28')).toBe(21);
    expect(urgencyOf('2026-10-06', '2026-10-07')).toBe('overdue');
    expect(urgencyOf('2026-10-21', '2026-10-07')).toBe('soon');
    expect(urgencyOf('2026-10-22', '2026-10-07')).toBe('later');
  });
});
