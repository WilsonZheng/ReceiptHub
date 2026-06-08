import { useEffect, useMemo, useState } from 'react';
import { listReceipts } from '../data/repo';
import { receiptsToCsv, summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { localToday } from '../lib/dates';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { DateField } from './components/DateField';
import type { Receipt, Space } from '../data/types';

type PresetKind = 'all' | 'thisMonth' | 'lastMonth' | 'last2Months' | 'thisYear';
type Selection = { kind: PresetKind } | { from: string; to: string };

// 全部用本地时区组日期——NZ 上午用 UTC 会差一天
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
// 月末必须经真实 Date 计算（ymd 是纯字符串拼接，传 day=0 会产出非法的 "-00"）
const endOfMonth = (y: number, m0: number) => {
  const d = new Date(y, m0 + 1, 0);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
};

// 预设边界用整月/整年，含未来日期的票（票面日期可能晚于今天）
function presetRange(kind: PresetKind, span: { from: string; to: string }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (kind === 'all') return span;
  if (kind === 'thisMonth') return { from: ymd(y, m, 1), to: endOfMonth(y, m) };
  if (kind === 'lastMonth') {
    const end = new Date(y, m, 0);
    return {
      from: ymd(end.getFullYear(), end.getMonth(), 1),
      to: ymd(end.getFullYear(), end.getMonth(), end.getDate()),
    };
  }
  if (kind === 'thisYear') return { from: `${y}-01-01`, to: `${y}-12-31` };
  const prev = new Date(y, m - 1, 1);
  return { from: ymd(prev.getFullYear(), prev.getMonth(), 1), to: endOfMonth(y, m) };
}

const PRESETS: { kind: PresetKind; labelKey: MsgKey }[] = [
  { kind: 'all', labelKey: 'allTime' },
  { kind: 'thisMonth', labelKey: 'thisMonth' },
  { kind: 'lastMonth', labelKey: 'lastMonth' },
  { kind: 'last2Months', labelKey: 'last2Months' },
  { kind: 'thisYear', labelKey: 'thisYear' },
];

export function ExportScreen({ space }: { space: Space }) {
  const [sel, setSel] = useState<Selection>({ kind: 'all' }); // 默认全部
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([]);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    void listReceipts(space).then(setAllReceipts);
  }, [space]);

  // 数据实际跨度（含未来日期），作为"全部"的边界
  const span = useMemo(() => {
    const today = localToday();
    if (!allReceipts.length) return { from: today, to: today };
    let min = allReceipts[0].date;
    let max = allReceipts[0].date;
    for (const r of allReceipts) {
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    return { from: min, to: max > today ? max : today };
  }, [allReceipts]);

  const { from, to } = 'kind' in sel ? presetRange(sel.kind, span) : sel;
  const receipts = useMemo(
    () => allReceipts.filter((r) => r.date >= from && r.date <= to),
    [allReceipts, from, to],
  );

  const s = useMemo(() => summarize(receipts), [receipts]);

  function download() {
    const blob = new Blob([receiptsToCsv(receipts)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipthub-${space}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="screen-wrap flex max-w-3xl flex-col gap-3 py-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = 'kind' in sel && sel.kind === p.kind;
          return (
            <button
              key={p.kind}
              onClick={() => setSel({ kind: p.kind })}
              className="segmented-btn"
              style={
                active
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                  : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
              }
            >
              {t(p.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DateField value={from} onChange={(v) => setSel({ from: v, to })} />
        <DateField value={to} onChange={(v) => setSel({ from, to: v })} />
      </div>
      <div className="panel panel-pad">
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {from} → {to} · {t(space)}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-sm">
            {t('expense')} ({s.expense.count})
          </span>
          <span className="amount text-2xl font-bold" style={{ color: 'var(--color-danger)' }}>
            -{formatNZD(s.expense.totalCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('income')} ({s.income.count})
          </span>
          <span className="amount text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>
            +{formatNZD(s.income.totalCents)}
          </span>
        </div>
        {space === 'company' && (
          <div
            className="mt-3 grid gap-1 border-t pt-3 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex justify-between gap-3">
              <span className="muted">{t('gstPaid')}</span>
              <span className="amount">{formatNZD(s.expense.gstCents)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="muted">{t('gstCollected')}</span>
              <span className="amount">{formatNZD(s.income.gstCents)}</span>
            </div>
            <div className="flex justify-between gap-3 font-bold">
              <span>{t('netGst')} </span>
              <span
                className="amount"
                style={{
                  color:
                    s.income.gstCents - s.expense.gstCents >= 0
                      ? 'var(--color-accent)'
                      : 'var(--color-danger)',
                }}
              >
                {formatNZD(s.income.gstCents - s.expense.gstCents)}
              </span>
            </div>
          </div>
        )}
        {(
          [
            ['expense', s.expense],
            ['income', s.income],
          ] as const
        ).map(([k, side]) =>
          side.count > 0 ? (
            <ul key={k} className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              {Object.entries(side.byCategory).map(([c, cents]) => (
                <li key={c} className="flex justify-between">
                  <span>
                    {categoryLabel(c, locale)}
                    {k === 'income' ? ` · ${t('income')}` : ''}
                  </span>
                  <span className="amount">{formatNZD(cents)}</span>
                </li>
              ))}
            </ul>
          ) : null,
        )}
      </div>
      <button
        onClick={download}
        disabled={s.expense.count + s.income.count === 0}
        className="btn-primary btn-glow w-full disabled:opacity-40 disabled:shadow-none"
      >
        {t('downloadCsv')}
      </button>
    </div>
  );
}
