import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { buildIndex, searchReceipts } from '../data/search';
import { summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { useLocale, useT } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { formatDate, formatMonth } from '../lib/dates';
import { kindOf, type Kind, type Receipt, type Space } from '../data/types';
import { ReceiptDetail } from './ReceiptDetail';

export function ReceiptsScreen({ space }: { space: Space }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [query, setQuery] = useState('');
  // 空间由右上角全局开关决定；列表内只筛收支维度
  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => setAll(rs.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))),
    });
    return () => sub.unsubscribe();
  }, []);

  const index = useMemo(() => buildIndex(all), [all]);
  const visible = useMemo(() => {
    let scoped = all.filter((r) => r.space === space);
    if (kindFilter !== 'all') scoped = scoped.filter((r) => kindOf(r) === kindFilter);
    if (!query.trim()) return scoped;
    const ids = new Set(searchReceipts(index, query));
    return scoped.filter((r) => ids.has(r.id));
  }, [all, space, kindFilter, query, index]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, Receipt[]>();
    for (const r of visible) {
      const k = r.date.slice(0, 7);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()];
  }, [visible]);
  const visibleSummary = useMemo(() => summarize(visible), [visible]);

  if (openId) return <ReceiptDetail id={openId} onClose={() => setOpenId(null)} />;

  return (
    <div className="screen-wrap flex max-w-3xl flex-col gap-3 py-2">
      <input
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field"
      />
      <div className="segmented-row">
        {(['all', 'expense', 'income'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className="segmented-btn"
            style={
              kindFilter === k
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
            }
          >
            {t(k === 'all' ? 'allTime' : k)}
          </button>
        ))}
      </div>
      {visible.length > 0 && (
        <div className="panel grid grid-cols-2 gap-3 px-4 py-3">
          <div>
            <p className="section-title">{t('expense')}</p>
            <p className="amount text-lg font-bold" style={{ color: 'var(--color-danger)' }}>
              {formatNZD(visibleSummary.expense.totalCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="section-title">{t('income')}</p>
            <p className="amount text-lg font-bold" style={{ color: 'var(--color-accent)' }}>
              {formatNZD(visibleSummary.income.totalCents)}
            </p>
          </div>
        </div>
      )}
      {byMonth.map(([month, recs]) => (
        <section key={month}>
          <h3 className="section-title py-1">{formatMonth(month, locale)}</h3>
          {recs.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="panel row-in mb-2 flex min-h-20 w-full items-center justify-between p-3 text-left sm:p-4"
              style={{
                animationDelay: `${Math.min(i, 8) * 28}ms`, // 进场微错峰
              }}
            >
              <span className="min-w-0 flex-1 pr-2">
                <span className="block text-sm font-semibold">{r.merchant}</span>
                {r.items && r.items.length > 0 && (
                  <span
                    className="block truncate text-[10px]"
                    style={{ color: 'var(--color-ink-muted)' }}
                  >
                    {r.items.join(' · ')}
                  </span>
                )}
                <span className="block text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {formatDate(r.date, locale)} · {categoryLabel(r.category, locale)}
                </span>
              </span>
              <span className="amount shrink-0 text-right">
                {/* 收入绿色带 +，支出红色带 −：一眼区分方向 */}
                <span
                  className="block text-sm font-bold"
                  style={{
                    color: kindOf(r) === 'income' ? 'var(--color-accent)' : 'var(--color-danger)',
                  }}
                >
                  {kindOf(r) === 'income' ? '+' : '-'}
                  {formatNZD(r.totalCents)}
                </span>
                {r.space === 'company' && (
                  <span className="block text-[9px]" style={{ color: 'var(--color-ink-muted)' }}>
                    GST {formatNZD(r.gstCents)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      ))}
      {visible.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {query ? t('noReceiptsMatch') : t('noReceiptsYet')}
        </p>
      )}
    </div>
  );
}
