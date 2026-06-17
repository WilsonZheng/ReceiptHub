import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { Camera } from 'lucide-react';
import { db } from '../data/db';
import { buildIndex, searchReceipts } from '../data/search';
import { summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { useLocale, useT } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { getConfig } from '../lib/settings';
import { formatDate, formatMonth } from '../lib/dates';
import { kindOf, type Kind, type Receipt, type Space } from '../data/types';
import { ReceiptDetail } from './ReceiptDetail';

export function ReceiptsScreen({ space, onCapture }: { space: Space; onCapture: () => void }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  // 空间由右上角全局开关决定；列表内只筛收支维度
  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => {
        setAll(rs.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1)));
        setLoaded(true);
      },
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

  const spaceHasAny = useMemo(() => all.some((r) => r.space === space), [all, space]);
  const catLabels = useMemo(() => getConfig().labels, []);
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
                    className="block truncate text-[11px]"
                    style={{ color: 'var(--color-ink-muted)' }}
                  >
                    {r.items.join(' · ')}
                  </span>
                )}
                <span className="block text-[11px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {formatDate(r.date, locale)} · {categoryLabel(r.category, locale, catLabels)}
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
                  <span className="block text-[11px]" style={{ color: 'var(--color-ink-muted)' }}>
                    GST {formatNZD(r.gstCents)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      ))}
      {/* 首帧 IndexedDB 还没回来时显示骨架，避免"还没有票据"误闪 */}
      {!loaded ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel flex min-h-20 items-center justify-between p-3 sm:p-4">
              <span className="flex flex-col gap-2">
                <span className="skeleton h-3.5 w-32" />
                <span className="skeleton h-2.5 w-24" />
              </span>
              <span className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 && (query || spaceHasAny) ? (
        // 有搜索词或被收支筛选挡住：轻量提示，不喧宾夺主
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {t('noReceiptsMatch')}
        </p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="panel flex h-14 w-14 items-center justify-center rounded-2xl">
            <Camera
              className="h-6 w-6"
              style={{ color: 'var(--color-accent)' }}
              aria-hidden="true"
            />
          </span>
          <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
            {t('noReceiptsYet')}
          </p>
          <button onClick={onCapture} className="btn-primary btn-glow px-6">
            <Camera className="icon" aria-hidden="true" />
            {t('goCaptureCta')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
