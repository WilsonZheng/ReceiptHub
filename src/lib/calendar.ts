import type { Locale } from './i18n';

/** 某月的 6×7 日历网格（周一开头），返回 42 个 ISO 日期 */
export function monthGrid(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const dow = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(y, m - 1, 1 - dow));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** 周一开头的星期表头（zh: 一二三四五六日 / en: M T W T F S S） */
export function weekdayLabels(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-NZ', { weekday: 'narrow' });
  // 2026-06-01 恰为周一，借它生成一周序列
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2026, 5, 1 + i))));
}
