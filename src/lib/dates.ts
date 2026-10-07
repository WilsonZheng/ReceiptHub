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

const EN_MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** 多月期间的简短名：'2026-09'..'2026-10' → zh: 2026年9月–10月 / en: Sep – Oct 2026；跨年两端都带年份 */
export function formatMonthRange(startYm: string, endYm: string, locale: Locale): string {
  if (startYm === endYm) return formatMonth(startYm, locale);
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  if (locale === 'zh')
    return sy === ey ? `${sy}年${sm}月–${em}月` : `${sy}年${sm}月–${ey}年${em}月`;
  // 固定缩写：ICU 的 en-NZ 在不同版本里 9 月是 "Sep" 或 "Sept"，期间名必须稳定
  const mon = (m: number) => EN_MONTHS[m - 1];
  return sy === ey ? `${mon(sm)} – ${mon(em)} ${ey}` : `${mon(sm)} ${sy} – ${mon(em)} ${ey}`;
}
