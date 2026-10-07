import { useEffect, useMemo, useState } from 'react';
import { listReceipts } from '../data/repo';
import { receiptsToCsv, summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { formatDate, localToday } from '../lib/dates';
import { gstReturn } from '../lib/gst';
import { periodAt } from '../lib/periods';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { getConfig, getGstFrequency } from '../lib/settings';
import { DateField } from './components/DateField';
import type { Receipt, Space } from '../data/types';

type PresetKind =
  | 'all'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisGstPeriod'
  | 'lastGstPeriod'
  | 'thisFy'
  | 'lastFy';
type Selection = { kind: PresetKind } | { from: string; to: string };

// 预设边界用整期（含未来日期的票——票面日期可能晚于今天）；期间计算全在本地日期上做
function presetRange(kind: PresetKind, span: { from: string; to: string }) {
  if (kind === 'all') return span;
  const today = localToday();
  const freq = getGstFrequency();
  const p =
    kind === 'thisMonth'
      ? periodAt(today, 'month', freq)
      : kind === 'lastMonth'
        ? periodAt(today, 'month', freq, -1)
        : kind === 'thisGstPeriod'
          ? periodAt(today, 'gst', freq)
          : kind === 'lastGstPeriod'
            ? periodAt(today, 'gst', freq, -1)
            : kind === 'thisFy'
              ? periodAt(today, 'fy', freq)
              : periodAt(today, 'fy', freq, -1);
  return { from: p.from, to: p.to };
}

const PRESETS: { kind: PresetKind; labelKey: MsgKey; companyOnly?: boolean }[] = [
  { kind: 'all', labelKey: 'allTime' },
  { kind: 'thisMonth', labelKey: 'thisMonth' },
  { kind: 'lastMonth', labelKey: 'lastMonth' },
  { kind: 'thisGstPeriod', labelKey: 'thisGstPeriod', companyOnly: true },
  { kind: 'lastGstPeriod', labelKey: 'lastGstPeriod', companyOnly: true },
  { kind: 'thisFy', labelKey: 'thisFy' },
  { kind: 'lastFy', labelKey: 'lastFy' },
];

export function ExportScreen({ space }: { space: Space }) {
  const [sel, setSel] = useState<Selection>({ kind: 'all' }); // 默认全部
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([]);
  const t = useT();
  const locale = useLocale();
  const catLabels = useMemo(() => getConfig().labels, []);

  useEffect(() => {
    void listReceipts(space).then(setAllReceipts);
    // 个人空间没有 GST 期预设：切过去时退回"全部"
    setSel((cur) =>
      'kind' in cur && space === 'personal' && PRESETS.find((p) => p.kind === cur.kind)?.companyOnly
        ? { kind: 'all' }
        : cur,
    );
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
  // GST 与统计页同一算法（IRD：按含税总额 × 3/23），两处数字一致
  const gst = useMemo(() => gstReturn(receipts), [receipts]);

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
        {PRESETS.filter((p) => !p.companyOnly || space === 'company').map((p) => {
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
          {formatDate(from, locale)} – {formatDate(to, locale)} · {t(space)}
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
              <span className="amount">{formatNZD(gst.box12)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="muted">{t('gstCollected')}</span>
              <span className="amount">{formatNZD(gst.box8)}</span>
            </div>
            <div className="flex justify-between gap-3 font-bold">
              <span>{t('netGst')} </span>
              <span
                className="amount"
                style={{ color: gst.box15 < 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}
              >
                {formatNZD(gst.box15)}
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
                    {categoryLabel(c, locale, catLabels)}
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
