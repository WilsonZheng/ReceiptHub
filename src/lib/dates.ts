import type { Locale } from './i18n';

const intlLocale = (l: Locale): string => (l === 'zh' ? 'zh-CN' : 'en-NZ');

/** '2026-06-07' → zh: 2026年6月7日 / en: 7 Jun 2026。非法日期原样返回（Intl 对 Invalid Date 会抛异常，防止整树崩溃） */
export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** 本地时区的今天（YYYY-MM-DD）。严禁用 toISOString().slice(0,10)——那是 UTC，NZ 每天上午都会差一天 */
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** '2026-06' → zh: 2026年6月 / en: June 2026 */
export function formatMonth(ym: string, locale: Locale): string {
  const d = new Date(ym + '-01T00:00:00');
  if (Number.isNaN(d.getTime())) return ym;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'long',
  }).format(d);
}
