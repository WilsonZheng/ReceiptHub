import { useState } from 'react';
import { useLocale, useT } from '../../lib/i18n';
import { formatDate, formatMonth, localToday } from '../../lib/dates';
import { addMonths, monthGrid, weekdayLabels } from '../../lib/calendar';

/**
 * 本地化日期选择器：原生 <input type="date"> 的语言跟随 iOS 系统、无法被网页控制，
 * 所以自绘一个 iOS 底部抽屉式日历，语言完全跟随 app 设置。
 */
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewYm, setViewYm] = useState(value.slice(0, 7));
  const locale = useLocale();
  const t = useT();

  const todayIso = localToday();

  function show() {
    setViewYm(value.slice(0, 7));
    setOpen(true);
  }
  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={show} aria-label={t('date')} className="field text-left">
        {formatDate(value, locale)}
      </button>

      {open && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="sheet-in w-full max-w-lg rounded-t-2xl p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 月份导航 */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewYm(addMonths(viewYm, -1))}
                aria-label="prev month"
                className="rounded-full px-3 py-1 text-lg"
                style={{ background: 'var(--color-surface-2)' }}
              >
                ‹
              </button>
              <span className="text-sm font-bold">{formatMonth(viewYm, locale)}</span>
              <button
                type="button"
                onClick={() => setViewYm(addMonths(viewYm, 1))}
                aria-label="next month"
                className="rounded-full px-3 py-1 text-lg"
                style={{ background: 'var(--color-surface-2)' }}
              >
                ›
              </button>
            </div>

            {/* 星期表头 */}
            <div
              className="grid grid-cols-7 text-center text-[10px]"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              {weekdayLabels(locale).map((w, i) => (
                <span key={i} className="py-1">
                  {w}
                </span>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7">
              {monthGrid(viewYm).map((iso) => {
                const inMonth = iso.startsWith(viewYm);
                const selected = iso === value;
                const isToday = iso === todayIso;
                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => pick(iso)}
                    className="mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm"
                    style={{
                      background: selected ? 'var(--color-accent)' : 'transparent',
                      color: selected
                        ? 'var(--color-accent-ink)'
                        : inMonth
                          ? 'var(--color-ink)'
                          : 'var(--color-ink-muted)',
                      opacity: inMonth ? 1 : 0.45,
                      border: isToday && !selected ? '1px solid var(--color-accent)' : 'none',
                      fontWeight: selected || isToday ? 700 : 400,
                    }}
                  >
                    {Number(iso.slice(8))}
                  </button>
                );
              })}
            </div>

            {/* 快捷：今天 */}
            <button
              type="button"
              onClick={() => pick(todayIso)}
              className="btn-secondary mt-2 w-full"
            >
              {t('today')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
