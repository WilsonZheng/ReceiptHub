import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { Camera } from 'lucide-react';
import { db } from '../data/db';
import { summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { aggregateByMonth, firstMonth, monthsBetween, pctChange, topBy } from '../lib/stats';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { getConfig } from '../lib/settings';
import { formatMonth } from '../lib/dates';
import { localToday } from '../lib/dates';
import { kindOf, type Receipt, type Space } from '../data/types';

type Range = 'month' | '6m' | 'year' | 'all';

const RANGES: { id: Range; labelKey: MsgKey }[] = [
  { id: 'month', labelKey: 'thisMonth' },
  { id: '6m', labelKey: 'last6Months' },
  { id: 'year', labelKey: 'thisYear' },
  { id: 'all', labelKey: 'allTime' },
];

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel panel-pad">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function DashboardScreen({ space, onCapture }: { space: Space; onCapture: () => void }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState<Range>('all'); // 默认：全部票据统计
  const [selMonth, setSelMonth] = useState<string | null>(null); // 点击趋势柱聚焦某月
  const [expandedCat, setExpandedCat] = useState<string | null>(null); // 分类下钻
  const t = useT();
  const locale = useLocale();
  const catLabels = useMemo(() => getConfig().labels, []);

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => {
        setAll(rs.filter((r) => !r.deleted));
        setLoaded(true);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  // 切换范围或空间时清掉聚焦状态
  useEffect(() => {
    setSelMonth(null);
    setExpandedCat(null);
  }, [range, space]);

  const today = localToday();
  const curYm = today.slice(0, 7);

  const scoped = useMemo(() => all.filter((r) => r.space === space), [all, space]);

  // 范围起始月
  const rangeFromYm = useMemo(() => {
    if (range === 'month') return curYm;
    if (range === '6m') {
      const [y, m] = curYm.split('-').map(Number);
      return new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 7);
    }
    if (range === 'year') return `${curYm.slice(0, 4)}-01`;
    return firstMonth(scoped) ?? curYm; // 全部：从最早一张票起
  }, [range, curYm, scoped]);

  // 不设未来上限：票面日期可能晚于今天（预订单/AI 提取的票面日期），静默排除会"丢票"
  const ranged = useMemo(
    () =>
      scoped.filter((r) => {
        const ym = r.date.slice(0, 7);
        if (range === 'month') return ym === curYm;
        if (range === 'year') return ym.startsWith(curYm.slice(0, 4));
        return ym >= rangeFromYm;
      }),
    [scoped, rangeFromYm, range, curYm],
  );

  // 趋势窗口锚到 max(本月, 最新票据月)——未来月的柱子也画出来
  const latestYm = useMemo(
    () => scoped.reduce((m, r) => (r.date.slice(0, 7) > m ? r.date.slice(0, 7) : m), curYm),
    [scoped, curYm],
  );
  const monthsInRange = monthsBetween(rangeFromYm, curYm);
  const trendN = Math.min(12, Math.max(monthsBetween(rangeFromYm, latestYm), 6));
  const trend = useMemo(
    () => aggregateByMonth(scoped, trendN, `${latestYm}-01`),
    [scoped, trendN, latestYm],
  );
  const maxBar = Math.max(...trend.map((m) => Math.max(m.expenseCents, m.incomeCents)), 1);

  const rangeSummary = useMemo(() => summarize(ranged), [ranged]);
  // 聚焦集：选中某月 → 该月；否则 → 整个范围
  const focus = useMemo(
    () => (selMonth ? scoped.filter((r) => r.date.startsWith(selMonth)) : ranged),
    [selMonth, scoped, ranged],
  );
  const focusSummary = useMemo(() => summarize(focus), [focus]);
  const focusExpenses = useMemo(() => focus.filter((r) => kindOf(r) === 'expense'), [focus]);

  const focusIncomes = useMemo(() => focus.filter((r) => kindOf(r) === 'income'), [focus]);
  const catsByKind = useMemo(
    () => ({
      expense: topBy(focusExpenses, (r) => r.category, 6),
      income: topBy(focusIncomes, (r) => r.category, 6),
    }),
    [focusExpenses, focusIncomes],
  );
  const kindTotals = {
    expense: focusSummary.expense.totalCents || 1,
    income: focusSummary.income.totalCents || 1,
  };
  const topMerch = useMemo(() => topBy(focusExpenses, (r) => r.merchant, 5), [focusExpenses]);

  const netCents = rangeSummary.income.totalCents - rangeSummary.expense.totalCents;
  const avgExpense = Math.round(rangeSummary.expense.totalCents / monthsInRange);

  // 环比（仅本月范围下展示，最直观）
  const prevYm = useMemo(() => {
    const [y, m] = curYm.split('-').map(Number);
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  }, [curYm]);
  const prevSummary = useMemo(
    () => summarize(scoped.filter((r) => r.date.startsWith(prevYm))),
    [scoped, prevYm],
  );
  const change =
    range === 'month'
      ? pctChange(rangeSummary.expense.totalCents, prevSummary.expense.totalCents)
      : null;

  // GST 申报周期卡（公司）：固定本月+上月，与筛选无关
  const gstPeriod = useMemo(
    () => summarize(scoped.filter((r) => r.date.startsWith(curYm) || r.date.startsWith(prevYm))),
    [scoped, curYm, prevYm],
  );

  // 首帧异步加载：骨架卡占位，避免"还没有数据"误闪
  if (!loaded) {
    return (
      <div className="screen-wrap flex flex-col gap-3 py-2" aria-hidden="true">
        <div className="skeleton h-9 w-full" />
        <div className="panel panel-pad flex flex-col gap-3">
          <div className="skeleton h-8 w-40 self-end" />
          <div className="skeleton h-5 w-28 self-end" />
        </div>
        <div className="panel panel-pad">
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    );
  }

  if (scoped.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="panel flex h-14 w-14 items-center justify-center rounded-2xl">
          <Camera className="h-6 w-6" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
        </span>
        <p className="max-w-xs text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {t('noDataHint')}
        </p>
        <button onClick={onCapture} className="btn-primary btn-glow px-6">
          <Camera className="icon" aria-hidden="true" />
          {t('goCaptureCta')}
        </button>
      </div>
    );
  }

  return (
    <div className="screen-wrap flex flex-col gap-3 py-2">
      {/* 范围筛选 */}
      <div className="grid grid-cols-4 gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className="segmented-btn px-2 text-xs sm:text-sm"
            style={
              range === r.id
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
            }
          >
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      {/* 总览：支出 / 收入 / 结余 / 月均 */}
      <Card title={`${t(RANGES.find((r) => r.id === range)!.labelKey)} · ${t(space)}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('expense')} ({rangeSummary.expense.count})
          </span>
          <span
            className="text-3xl font-black tracking-tighter"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-danger)' }}
          >
            -{formatNZD(rangeSummary.expense.totalCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('income')} ({rangeSummary.income.count})
          </span>
          <span
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-accent)' }}
          >
            +{formatNZD(rangeSummary.income.totalCents)}
          </span>
        </div>
        <div
          className="mt-1 flex items-baseline justify-between border-t pt-1"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-sm font-semibold">{t('balance')}</span>
          <span
            className="text-lg font-bold"
            style={{
              fontFamily: 'var(--font-numeric)',
              color: netCents >= 0 ? 'var(--color-accent)' : 'var(--color-danger)',
            }}
          >
            {netCents >= 0 ? '+' : ''}
            {formatNZD(netCents)}
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {monthsInRange > 1 && (
            <>
              {t('avgMonthly')} {formatNZD(avgExpense)}
            </>
          )}
          {change !== null && (
            <span style={{ color: change > 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}>
              {t('expense')} {change > 0 ? '↑' : '↓'} {Math.abs(change)}% {t('vsLastMonth')}
            </span>
          )}
        </p>
      </Card>

      {/* 趋势：柱子可点击聚焦某月 */}
      <Card
        title={t('trend')}
        right={
          selMonth && (
            <button
              onClick={() => setSelMonth(null)}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
            >
              {formatMonth(selMonth, locale)} ✕
            </button>
          )
        }
      >
        <div className="flex h-24 items-end justify-between gap-1">
          {trend.map((m) => {
            const dimmed = selMonth !== null && selMonth !== m.month;
            return (
              <button
                key={m.month}
                aria-label={`${formatMonth(m.month, locale)}: ${t('expense')} ${formatNZD(m.expenseCents)}, ${t('income')} ${formatNZD(m.incomeCents)}`}
                onClick={() => {
                  setSelMonth(selMonth === m.month ? null : m.month);
                  setExpandedCat(null);
                }}
                className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                style={{ opacity: dimmed ? 0.35 : 1 }}
              >
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div
                    className="w-2.5 rounded-t"
                    style={{
                      height: `${(m.expenseCents / maxBar) * 100}%`,
                      background: 'var(--color-danger)',
                      minHeight: m.expenseCents > 0 ? 2 : 0,
                    }}
                  />
                  <div
                    className="w-2.5 rounded-t"
                    style={{
                      height: `${(m.incomeCents / maxBar) * 100}%`,
                      background: 'var(--color-accent)',
                      minHeight: m.incomeCents > 0 ? 2 : 0,
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color: selMonth === m.month ? 'var(--color-accent)' : 'var(--color-ink-muted)',
                  }}
                >
                  {m.month.slice(5)}
                </span>
              </button>
            );
          })}
        </div>
        {selMonth && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
            {t('expense')} {formatNZD(focusSummary.expense.totalCents)} · {t('income')} +
            {formatNZD(focusSummary.income.totalCents)} ·{' '}
            {focusSummary.expense.count + focusSummary.income.count} {t('receiptsUnit')}
          </p>
        )}
      </Card>

      {/* 分类排行：支出/收入双榜，占比 % + 点击下钻看商家构成 */}
      {(catsByKind.expense.length > 0 || catsByKind.income.length > 0) && (
        <Card title={t('topCategories')}>
          {(['expense', 'income'] as const).map((k) => {
            const cats = catsByKind[k];
            if (cats.length === 0) return null;
            const color = k === 'expense' ? 'var(--color-danger)' : 'var(--color-accent)';
            const source = k === 'expense' ? focusExpenses : focusIncomes;
            return (
              <div key={k} className="mb-2 last:mb-0">
                <p
                  className="mb-1 text-[11px] font-semibold"
                  style={{ color: 'var(--color-ink-muted)' }}
                >
                  {t(k)}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {cats.map(([c, cents]) => {
                    const pct = Math.round((cents / kindTotals[k]) * 100);
                    const key = `${k}:${c}`;
                    const expanded = expandedCat === key;
                    const catMerchants = expanded
                      ? topBy(
                          source.filter((r) => r.category === c),
                          (r) => r.merchant,
                          4,
                        )
                      : [];
                    return (
                      <li key={c} className="text-xs">
                        <button
                          onClick={() => setExpandedCat(expanded ? null : key)}
                          className="w-full text-left"
                        >
                          <div className="flex justify-between">
                            <span>
                              {categoryLabel(c, locale, catLabels)}{' '}
                              <span style={{ color: 'var(--color-ink-muted)' }}>{pct}%</span>
                            </span>
                            <span style={{ fontFamily: 'var(--font-numeric)', color }}>
                              {k === 'expense' ? '-' : '+'}
                              {formatNZD(cents)}
                            </span>
                          </div>
                          <div
                            className="mt-0.5 h-1.5 rounded-full"
                            style={{ background: 'var(--color-surface-2)' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: color,
                                transition: 'width .3s cubic-bezier(.32,.72,0,1)',
                              }}
                            />
                          </div>
                        </button>
                        {expanded && (
                          <ul className="screen-in mt-1 flex flex-col gap-0.5 pl-3">
                            {catMerchants.map(([m, mc]) => (
                              <li
                                key={m}
                                className="flex justify-between"
                                style={{ color: 'var(--color-ink-muted)' }}
                              >
                                <span>— {m}</span>
                                <span style={{ fontFamily: 'var(--font-numeric)' }}>
                                  {formatNZD(mc)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </Card>
      )}

      {/* 商家排行 */}
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

      {/* GST 申报周期（公司）：固定近两月，与上方筛选无关 */}
      {space === 'company' && (
        <Card title={t('gstPeriod')}>
          <div className="flex justify-between text-xs">
            <span>{t('gstPaid')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(gstPeriod.expense.gstCents)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span>{t('gstCollected')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(gstPeriod.income.gstCents)}
            </span>
          </div>
          <div
            className="mt-1 flex justify-between border-t pt-1 text-sm font-bold"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span>{t('netGst')}</span>
            <span style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-accent)' }}>
              {formatNZD(gstPeriod.income.gstCents - gstPeriod.expense.gstCents)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
