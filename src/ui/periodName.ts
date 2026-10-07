import { fyName, type Period, type PeriodMode } from '../lib/periods';
import { formatMonth, formatMonthRange } from '../lib/dates';
import type { Locale, MsgKey } from '../lib/i18n';

/** 期间的显示名：月度 "2026年10月"、GST 期 "2026年9月–10月"、财年 "2026–27 财年"、年度 "2026" */
export function periodName(
  mode: PeriodMode,
  p: Period,
  locale: Locale,
  t: (k: MsgKey) => string,
): string {
  if (mode === 'month') return formatMonth(p.startYm, locale);
  if (mode === 'year') return p.startYm.slice(0, 4);
  if (mode === 'fy') return t('fyName').replace('{y}', fyName(p.endYm));
  return formatMonthRange(p.startYm, p.endYm, locale);
}
