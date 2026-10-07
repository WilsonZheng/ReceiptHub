import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../data/db';
import { summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { aggregateByMonth, firstMonth, monthsBetween, pctChange, topBy } from '../lib/stats';
import { gstReturn, type GstReturn } from '../lib/gst';
import {
  gstDueDate,
  incomeTaxDueDate,
  periodAt,
  periodOffsetOf,
  type Period,
  type PeriodMode,
} from '../lib/periods';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { getConfig, getGstFrequency } from '../lib/settings';
import { formatDate, formatMonth, localToday } from '../lib/dates';
import { kindOf, type Receipt, type Space } from '../data/types';
import { periodName } from './periodName';

type Mode = PeriodMode | 'all';

const MODES: { id: Mode; labelKey: MsgKey; companyOnly?: boolean }[] = [
  { id: 'month', labelKey: 'rangeMonth' },
  { id: 'gst', labelKey: 'rangeGst', companyOnly: true },
  { id: 'fy', labelKey: 'rangeFy' },
  { id: 'year', labelKey: 'rangeYear' },
  { id: 'all', labelKey: 'allTime' },
];

// 记住上次选的范围（仅本机便利，读写失败就用默认值）
const MODE_KEY = 'rh.stats.range';
function loadMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (MODES.some((m) => m.id === v)) return v as Mode;
  } catch {
    /* 隐私模式等读不到存储时用默认 */
  }
  return 'all';
}
function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* 同上 */
  }
}

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
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''}`}>
      <span className={strong ? '' : 'muted'}>{label}</span>
      <span className="amount shrink-0">{value}</span>
    </div>
  );
}

/** GST 抵扣：销项被进项抵消多少、净额应缴还是应退；GST 期模式下附 myIR 申报表各栏 */
function GstCard({
  ret,
  mode,
  period,
  today,
}: {
  ret: GstReturn;
  mode: Mode;
  period: Period | null;
  today: string;
}) {
  const t = useT();
  const locale = useLocale();
  const output = ret.box8;
  const input = ret.box12;
  const offset = Math.min(output, input);
  const pct = output > 0 ? Math.round((offset / output) * 100) : 0;
  const refund = ret.box15 < 0;

  let status: React.ReactNode = null;
  if (mode === 'gst' && period) {
    const due = gstDueDate(period.endYm);
    const ready = today > period.to && today <= due;
    const label = ready
      ? t('gstReadyToFile')
      : today >= period.from && today <= period.to
        ? t('gstInProgress')
        : null;
    status = (
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={
          ready
            ? { background: 'var(--color-warning)', color: 'var(--color-accent-ink)' }
            : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
        }
      >
        {label && `${label} · `}
        {t('gstDue').replace('{d}', formatDate(due, locale))}
      </span>
    );
  }

  return (
    <Card title={t('gstTitle')} right={status}>
      {output === 0 && input === 0 ? (
        <p className="text-sm muted">{t('gstNone')}</p>
      ) : (
        <>
          <div className="grid gap-1 text-sm">
            <Row label={t('gstOnIncome')} value={formatNZD(output)} />
            <Row label={t('gstOnExpenses')} value={formatNZD(input)} />
          </div>
          {/* 抵消条：整条 = 销项；绿色部分 = 被进项抵消的额度 */}
          {output > 0 && (
            <div className="mt-3">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: 'var(--color-surface-2)' }}
                role="img"
                aria-label={`${t('gstOffsetBy')} ${pct}%`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: 'var(--color-accent)',
                    transition: 'width .3s cubic-bezier(.32,.72,0,1)',
                  }}
                />
              </div>
              <p className="mt-1 text-xs muted">
                {pct >= 100 ? t('gstAllOffset') : t('gstOffsetBy')}{' '}
                <span className="amount" style={{ color: 'var(--color-ink)' }}>
                  {formatNZD(offset)}
                </span>{' '}
                · {pct}%
              </p>
            </div>
          )}
          <div
            className="mt-3 flex items-baseline justify-between border-t pt-2"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="text-sm font-semibold">{refund ? t('gstRefund') : t('gstToPay')}</span>
            <span
              className="amount text-xl font-bold"
              style={{ color: refund ? 'var(--color-accent)' : 'var(--color-ink)' }}
            >
              {refund ? '+' : ''}
              {formatNZD(Math.abs(ret.box15))}
            </span>
          </div>
        </>
      )}

      {/* myIR 申报表：数字可直接照填 */}
      {mode === 'gst' && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
          <p className="mb-1 text-xs font-semibold muted">{t('myirBoxes')}</p>
          <div className="grid gap-1 text-xs">
            <Row label={t('box5')} value={formatNZD(ret.box5)} />
            <Row label={t('box6')} value={formatNZD(ret.box6)} />
            <Row label={t('box8')} value={formatNZD(ret.box8)} />
            <Row label={t('box11')} value={formatNZD(ret.box11)} />
            <Row label={t('box12')} value={formatNZD(ret.box12)} />
            <Row label={t('box15')} value={formatNZD(ret.box15)} strong />
          </div>
          <p className="mt-2 text-[11px] muted">{t('boxNote')}</p>
        </div>
      )}
    </Card>
  );
}

export function DashboardScreen({ space, onCapture }: { space: Space; onCapture: () => void }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modeSel, setModeSel] = useState<Mode>(loadMode);
  const [offset, setOffset] = useState(0); // 0 = 当前期间，-1 = 上一期…
  const [selMonth, setSelMonth] = useState<string | null>(null); // 点击趋势柱聚焦某月
  const [expandedCat, setExpandedCat] = useState<string | null>(null); // 分类下钻
  const t = useT();
  const locale = useLocale();
  const catLabels = useMemo(() => getConfig().labels, []);
  const freq = useMemo(getGstFrequency, []);

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => {
        setAll(rs.filter((r) => !r.deleted));
        setLoaded(true);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  // 个人空间没有 GST：记住的 GST 期模式退回月度
  const mode: Mode = space === 'personal' && modeSel === 'gst' ? 'month' : modeSel;
  const modes = MODES.filter((m) => !m.companyOnly || space === 'company');

  // 切换范围、翻页或空间时清掉聚焦状态
  useEffect(() => {
    setSelMonth(null);
    setExpandedCat(null);
  }, [mode, offset, space]);

  function chooseMode(m: Mode) {
    setModeSel(m);
    setOffset(0);
    saveMode(m);
  }

  const today = localToday();
  const curYm = today.slice(0, 7);

  const scoped = useMemo(() => all.filter((r) => r.space === space), [all, space]);
  const period = useMemo(
    () => (mode === 'all' ? null : periodAt(today, mode, freq, offset)),
    [mode, today, freq, offset],
  );
  const prevPeriod = useMemo(
    () => (mode === 'all' ? null : periodAt(today, mode, freq, offset - 1)),
    [mode, today, freq, offset],
  );

  // 翻页范围：min(上一期, 最早一张票所在期) ~ max(下一期, 最晚一张票所在期)——去年/明年总能翻到
  const [minOffset, maxOffset] = useMemo(() => {
    if (mode === 'all') return [0, 0];
    let lo = -1;
    let hi = 1;
    for (const r of scoped) {
      const o = periodOffsetOf(r.date, today, mode, freq);
      if (o < lo) lo = o;
      if (o > hi) hi = o;
    }
    return [lo, hi];
  }, [scoped, mode, freq, today]);

  // 不设未来上限：票面日期可能晚于今天（预订单/AI 提取的票面日期），静默排除会"丢票"
  const ranged = useMemo(
    () => (period ? scoped.filter((r) => r.date >= period.from && r.date <= period.to) : scoped),
    [scoped, period],
  );

  const firstYm = useMemo(() => firstMonth(scoped) ?? curYm, [scoped, curYm]);
  const latestYm = useMemo(
    () => scoped.reduce((m, r) => (r.date.slice(0, 7) > m ? r.date.slice(0, 7) : m), curYm),
    [scoped, curYm],
  );

  // 月均：只算已经过去（含本月）的月份，当前财年不会被未到的月份摊薄
  const elapsedMonths = period
    ? period.startYm > curYm
      ? 0
      : monthsBetween(period.startYm, period.endYm < curYm ? period.endYm : curYm)
    : Math.max(1, monthsBetween(firstYm, curYm));

  // 趋势窗口：期间模式画该期（至少 6 个月，结束于期末）；全部模式锚到 max(本月, 最新票据月)
  const trendEnd = period ? period.endYm : latestYm;
  const trendN = period
    ? Math.max(6, period.months)
    : Math.min(12, Math.max(monthsBetween(firstYm, latestYm), 6));
  const trend = useMemo(
    () => aggregateByMonth(scoped, trendN, `${trendEnd}-01`),
    [scoped, trendN, trendEnd],
  );
  const maxBar = Math.max(...trend.map((m) => Math.max(m.expenseCents, m.incomeCents)), 1);
  const inRange = (ym: string) => !period || (ym >= period.startYm && ym <= period.endYm);

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
  // 所得税看不含 GST 的数：收入、支出各自扣掉 GST
  const netExGst =
    rangeSummary.income.totalCents -
    rangeSummary.income.gstCents -
    (rangeSummary.expense.totalCents - rangeSummary.expense.gstCents);
  const avgExpense =
    elapsedMonths > 0 ? Math.round(rangeSummary.expense.totalCents / elapsedMonths) : 0;

  // 与上一期比较支出（同一种期间）
  const prevSummary = useMemo(
    () =>
      prevPeriod
        ? summarize(scoped.filter((r) => r.date >= prevPeriod.from && r.date <= prevPeriod.to))
        : null,
    [scoped, prevPeriod],
  );
  const change = prevSummary
    ? pctChange(rangeSummary.expense.totalCents, prevSummary.expense.totalCents)
    : null;

  const gst = useMemo(() => gstReturn(ranged), [ranged]);

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
      {/* 范围类型 */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
      >
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => chooseMode(m.id)}
            aria-pressed={mode === m.id}
            className="segmented-btn px-1 text-xs sm:text-sm"
            style={
              mode === m.id
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
            }
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>

      {/* 期间翻页：‹ 上一期 · 期间名（点击回到当前）· 下一期 › */}
      {period && mode !== 'all' && (
        <div className="panel flex items-center gap-1 p-1">
          <button
            onClick={() => setOffset(offset - 1)}
            disabled={offset <= minOffset}
            aria-label={t('prevPeriod')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-30"
          >
            <ChevronLeft className="icon-lg" aria-hidden="true" />
          </button>
          <button
            onClick={() => setOffset(0)}
            disabled={offset === 0}
            className="min-w-0 flex-1 py-1 text-center"
          >
            <span className="block truncate text-sm font-bold">
              {periodName(mode, period, locale, t)}
            </span>
            <span className="block truncate text-[11px] muted">
              {formatDate(period.from, locale)} – {formatDate(period.to, locale)}
              {offset !== 0 && (
                <span style={{ color: 'var(--color-accent)' }}> · {t('backToCurrent')}</span>
              )}
            </span>
          </button>
          <button
            onClick={() => setOffset(offset + 1)}
            disabled={offset >= maxOffset}
            aria-label={t('nextPeriod')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-30"
          >
            <ChevronRight className="icon-lg" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 总览：支出 / 收入 / 结余 / 月均 */}
      <Card title={t(space)}>
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
        {space === 'company' && (
          <div className="flex items-baseline justify-between text-xs muted">
            <span>{t('netExGst')}</span>
            <span className="amount">
              {netExGst >= 0 ? '+' : ''}
              {formatNZD(netExGst)}
            </span>
          </div>
        )}
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs muted">
          {elapsedMonths > 1 && (
            <span>
              {t('avgMonthly')} {formatNZD(avgExpense)}
            </span>
          )}
          {change !== null && (
            <span style={{ color: change > 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}>
              {t('expense')} {change > 0 ? '↑' : '↓'} {Math.abs(change)}% {t('vsPrevPeriod')}
            </span>
          )}
        </p>
        {mode === 'fy' && period && (
          <p className="mt-1 text-[11px] muted">
            {t('incomeTaxDue').replace('{d}', formatDate(incomeTaxDueDate(period.endYm), locale))}
          </p>
        )}
      </Card>

      {/* GST 抵扣（公司）：跟随所选期间 */}
      {space === 'company' && <GstCard ret={gst} mode={mode} period={period} today={today} />}

      {/* 趋势：柱子可点击聚焦某月；期间外的月份淡显 */}
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
            const dimmed = selMonth !== null ? selMonth !== m.month : !inRange(m.month);
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
            {t('expense')} -{formatNZD(focusSummary.expense.totalCents)} · {t('income')} +
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
                          aria-expanded={expanded}
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

      {/* 商家排行（支出） */}
      {topMerch.length > 0 && (
        <Card title={t('topMerchants')}>
          <ul className="flex flex-col gap-1 text-xs">
            {topMerch.map(([m, cents], i) => (
              <li key={m} className="flex justify-between">
                <span>
                  <span style={{ color: 'var(--color-ink-muted)' }}>{i + 1}.</span> {m}
                </span>
                <span style={{ fontFamily: 'var(--font-numeric)' }}>-{formatNZD(cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
