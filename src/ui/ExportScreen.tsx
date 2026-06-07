import { useEffect, useMemo, useState } from 'react';
import { listReceipts } from '../data/repo';
import { receiptsToCsv, summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { DateField } from './components/DateField';
import type { Receipt, Space } from '../data/types';

type PresetKind = 'thisMonth' | 'lastMonth' | 'last2Months';

// 全部用本地时区组日期——NZ 上午用 UTC 会差一天
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

function preset(kind: PresetKind): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = ymd(y, m, now.getDate());
  if (kind === 'thisMonth') return { from: ymd(y, m, 1), to: today };
  if (kind === 'lastMonth') {
    const end = new Date(y, m, 0); // 上月最后一天（本地）
    return {
      from: ymd(end.getFullYear(), end.getMonth(), 1),
      to: ymd(end.getFullYear(), end.getMonth(), end.getDate()),
    };
  }
  const prev = new Date(y, m - 1, 1);
  return { from: ymd(prev.getFullYear(), prev.getMonth(), 1), to: today };
}

const PRESETS: { kind: PresetKind; labelKey: MsgKey }[] = [
  { kind: 'thisMonth', labelKey: 'thisMonth' },
  { kind: 'lastMonth', labelKey: 'lastMonth' },
  { kind: 'last2Months', labelKey: 'last2Months' },
];

export function ExportScreen({ space }: { space: Space }) {
  const [{ from, to }, setRange] = useState(preset('last2Months'));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    void listReceipts(space).then((rs) =>
      setReceipts(rs.filter((r) => r.date >= from && r.date <= to)),
    );
  }, [space, from, to]);

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
    <div className="flex flex-col gap-3 py-2">
      <div className="flex gap-2 text-xs">
        {PRESETS.map((p) => (
          <button
            key={p.kind}
            onClick={() => setRange(preset(p.kind))}
            className="rounded-full px-3 py-1.5"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DateField value={from} onChange={(v) => setRange({ from: v, to })} />
        <DateField value={to} onChange={(v) => setRange({ from, to: v })} />
      </div>
      <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {from} → {to} · {t(space)}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-sm">
            {t('expense')} ({s.expense.count})
          </span>
          <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>
            {formatNZD(s.expense.totalCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {t('income')} ({s.income.count})
          </span>
          <span
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--color-accent)' }}
          >
            +{formatNZD(s.income.totalCents)}
          </span>
        </div>
        {space === 'company' && (
          <p className="mt-1 text-sm" style={{ color: 'var(--color-accent)' }}>
            {t('gstPaid')} {formatNZD(s.expense.gstCents)} · {t('gstCollected')}{' '}
            {formatNZD(s.income.gstCents)} · {t('netGst')}{' '}
            {formatNZD(s.income.gstCents - s.expense.gstCents)}
          </p>
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
                  <span style={{ fontFamily: 'var(--font-numeric)' }}>{formatNZD(cents)}</span>
                </li>
              ))}
            </ul>
          ) : null,
        )}
      </div>
      <button
        onClick={download}
        disabled={s.expense.count + s.income.count === 0}
        className="rounded-xl py-3 font-bold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('downloadCsv')}
      </button>
    </div>
  );
}
