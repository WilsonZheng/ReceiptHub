import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { aggregateByMonth, pctChange, topBy } from '../lib/stats';
import { useT } from '../lib/i18n';
import { kindOf, type Receipt, type Space } from '../data/types';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
      <h3
        className="mb-2 text-xs font-bold tracking-wide"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DashboardScreen({ space }: { space: Space }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const t = useT();

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => setAll(rs.filter((r) => !r.deleted)),
    });
    return () => sub.unsubscribe();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const curMonth = today.slice(0, 7);
  const [cy, cm] = curMonth.split('-').map(Number);
  const prevMonth = new Date(Date.UTC(cy, cm - 2, 1)).toISOString().slice(0, 7);

  const scoped = useMemo(() => all.filter((r) => r.space === space), [all, space]);
  const curList = useMemo(
    () => scoped.filter((r) => r.date.startsWith(curMonth)),
    [scoped, curMonth],
  );
  const prevList = useMemo(
    () => scoped.filter((r) => r.date.startsWith(prevMonth)),
    [scoped, prevMonth],
  );

  const cur = useMemo(() => summarize(curList), [curList]);
  const prev = useMemo(() => summarize(prevList), [prevList]);
  const change = pctChange(cur.expense.totalCents, prev.expense.totalCents);
  const trend = useMemo(() => aggregateByMonth(scoped, 6, today), [scoped, today]);
  const maxBar = Math.max(...trend.map((m) => Math.max(m.expenseCents, m.incomeCents)), 1);
  const curExpenses = useMemo(() => curList.filter((r) => kindOf(r) === 'expense'), [curList]);
  const topCats = useMemo(() => topBy(curExpenses, (r) => r.category, 5), [curExpenses]);
  const maxCat = topCats[0]?.[1] ?? 1;
  const topMerch = useMemo(() => topBy(curExpenses, (r) => r.merchant, 5), [curExpenses]);
  const period = useMemo(() => summarize([...curList, ...prevList]), [curList, prevList]);

  if (scoped.length === 0) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        {t('noData')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* 本月概览 */}
      <Card title={`${t('thisMonth')} · ${t(space)}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('expense')} ({cur.expense.count})
          </span>
          <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>
            {formatNZD(cur.expense.totalCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('income')} ({cur.income.count})
          </span>
          <span
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-accent)' }}
          >
            +{formatNZD(cur.income.totalCents)}
          </span>
        </div>
        {change !== null && (
          <p
            className="mt-1 text-xs"
            style={{ color: change > 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}
          >
            {t('expense')} {change > 0 ? '↑' : '↓'} {Math.abs(change)}% {t('vsLastMonth')}
          </p>
        )}
      </Card>

      {/* 近 6 个月趋势 */}
      <Card title={t('last6Months')}>
        <div className="flex h-24 items-end justify-between gap-1">
          {trend.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-0.5">
              <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                <div
                  className="w-2.5 rounded-t"
                  style={{
                    height: `${(m.expenseCents / maxBar) * 100}%`,
                    background: 'var(--color-ink-muted)',
                    minHeight: m.expenseCents > 0 ? 2 : 0,
                  }}
                  title={`${m.month} ${t('expense')} ${formatNZD(m.expenseCents)}`}
                />
                <div
                  className="w-2.5 rounded-t"
                  style={{
                    height: `${(m.incomeCents / maxBar) * 100}%`,
                    background: 'var(--color-accent)',
                    minHeight: m.incomeCents > 0 ? 2 : 0,
                  }}
                  title={`${m.month} ${t('income')} ${formatNZD(m.incomeCents)}`}
                />
              </div>
              <span className="text-[9px]" style={{ color: 'var(--color-ink-muted)' }}>
                {m.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* 本月分类排行（支出） */}
      {topCats.length > 0 && (
        <Card title={t('topCategories')}>
          <ul className="flex flex-col gap-1.5">
            {topCats.map(([c, cents]) => (
              <li key={c} className="text-xs">
                <div className="flex justify-between">
                  <span>{c}</span>
                  <span style={{ fontFamily: 'var(--font-numeric)' }}>{formatNZD(cents)}</span>
                </div>
                <div
                  className="mt-0.5 h-1.5 rounded-full"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(cents / maxCat) * 100}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 本月商家排行（支出） */}
      {topMerch.length > 0 && (
        <Card title={t('topMerchants')}>
          <ul className="flex flex-col gap-1 text-xs">
            {topMerch.map(([m, cents], i) => (
              <li key={m} className="flex justify-between">
                <span>
                  <span style={{ color: 'var(--color-ink-muted)' }}>{i + 1}.</span> {m}
                </span>
                <span style={{ fontFamily: 'var(--font-numeric)' }}>{formatNZD(cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* GST 近两月（仅公司） */}
      {space === 'company' && (
        <Card title={t('gstPeriod')}>
          <div className="flex justify-between text-xs">
            <span>{t('gstPaid')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(period.expense.gstCents)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span>{t('gstCollected')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(period.income.gstCents)}
            </span>
          </div>
          <div
            className="mt-1 flex justify-between border-t pt-1 text-sm font-bold"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span>{t('netGst')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-accent)' }}>
              {formatNZD(period.income.gstCents - period.expense.gstCents)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
