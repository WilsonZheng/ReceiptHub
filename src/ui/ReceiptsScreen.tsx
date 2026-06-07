import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { buildIndex, searchReceipts } from '../data/search';
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

  if (openId) return <ReceiptDetail id={openId} onClose={() => setOpenId(null)} />;

  return (
    <div className="flex flex-col gap-2 py-2">
      <input
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field"
      />
      <div className="flex gap-1.5 text-xs font-semibold">
        {(['all', 'expense', 'income'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className="rounded-full px-3 py-1"
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
      {byMonth.map(([month, recs]) => (
        <section key={month}>
          <h3
            className="py-1 text-[10px] font-bold tracking-widest"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {formatMonth(month, locale)}
          </h3>
          {recs.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="row-in mb-1.5 flex w-full items-center justify-between rounded-xl p-3 text-left"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
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
              <span className="shrink-0 text-right" style={{ fontFamily: 'var(--font-numeric)' }}>
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
