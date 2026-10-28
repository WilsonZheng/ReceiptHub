import { describe, expect, it } from 'vitest';
import { whenText } from './taxAgenda';
import type { MsgKey } from '../lib/i18n';

const EN: Partial<Record<MsgKey, string>> = {
  dueToday: 'Due today',
  daysLeft: '{n} days left',
  dayLeft: '1 day left',
  daysOverdue: '{n} days overdue',
  dayOverdue: '1 day overdue',
};
const t = (k: MsgKey) => EN[k] ?? k;

describe('whenText', () => {
  it('uses the singular for exactly one day', () => {
    expect(whenText('2026-10-28', '2026-10-27', t)).toBe('1 day left');
    expect(whenText('2026-10-26', '2026-10-27', t)).toBe('1 day overdue');
  });
  it('keeps the plural otherwise', () => {
    expect(whenText('2026-10-31', '2026-10-27', t)).toBe('4 days left');
    expect(whenText('2026-10-24', '2026-10-27', t)).toBe('3 days overdue');
    expect(whenText('2026-10-27', '2026-10-27', t)).toBe('Due today');
  });
});
