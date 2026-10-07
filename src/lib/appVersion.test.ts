import { describe, expect, it } from 'vitest';
import { versionLabel } from './appVersion';

describe('versionLabel', () => {
  it('build date in local time plus the short commit', () => {
    expect(versionLabel('2026-10-07T02:00:00Z', 'abc1234')).toMatch(/^2026\.10\.07 · abc1234$/);
  });
});
