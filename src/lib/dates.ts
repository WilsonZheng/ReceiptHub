import type { Locale } from './i18n';

const intlLocale = (l: Locale): string => (l === 'zh' ? 'zh-CN' : 'en-NZ');

/** '2026-06-07' → zh: 2026年6月7日 / en: 7 Jun 2026 */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso + 'T00:00:00'));
}

/** '2026-06' → zh: 2026年6月 / en: June 2026 */
export function formatMonth(ym: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'long',
  }).format(new Date(ym + '-01T00:00:00'));
}
