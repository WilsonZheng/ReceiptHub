import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { buildIndex, searchReceipts } from '../data/search';
import { formatNZD } from '../lib/money';
import { useT } from '../lib/i18n';
import type { Receipt, Space } from '../data/types';
import { ReceiptDetail } from './ReceiptDetail';

export function ReceiptsScreen({ space }: { space: Space }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Space | 'all'>(space);
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useT();

  useEffect(() => setScope(space), [space]);
  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => setAll(rs.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))),
    });
    return () => sub.unsubscribe();
  }, []);

  const index = useMemo(() => buildIndex(all), [all]);
  const visible = useMemo(() => {
    const scoped = scope === 'all' ? all : all.filter((r) => r.space === scope);
    if (!query.trim()) return scoped;
    const ids = new Set(searchReceipts(index, query));
    return scoped.filter((r) => ids.has(r.id));
  }, [all, scope, query, index]);

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
      <div className="flex gap-3 text-xs font-semibold">
        {([space, 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className="underline-offset-4"
            style={{ color: scope === s ? 'var(--color-accent)' : 'var(--color-ink-muted)' }}
          >
            {t(s)}
          </button>
        ))}
      </div>
      {byMonth.map(([month, recs]) => (
        <section key={month}>
          <h3
            className="py-1 text-[10px] font-bold tracking-widest"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {month}
          </h3>
          {recs.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="mb-1.5 flex w-full items-center justify-between rounded-xl p-3 text-left"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span>
                <span className="block text-sm font-semibold">{r.merchant}</span>
                <span className="block text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {r.date} · {r.category}
                  {r.space === 'personal' ? t('personalSuffix') : ''}
                </span>
              </span>
              <span className="text-right" style={{ fontFamily: 'var(--font-numeric)' }}>
                <span className="block text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
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
