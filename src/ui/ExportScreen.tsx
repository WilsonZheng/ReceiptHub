import { useEffect, useMemo, useState } from 'react';
import { listReceipts } from '../data/repo';
import { receiptsToCsv, summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import { useT, type MsgKey } from '../lib/i18n';
import type { Receipt, Space } from '../data/types';

const iso = (d: Date) => d.toISOString().slice(0, 10);

type PresetKind = 'thisMonth' | 'lastMonth' | 'last2Months';

function preset(kind: PresetKind): { from: string; to: string } {
  const now = new Date();
  const first = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
  if (kind === 'thisMonth')
    return { from: iso(first(now.getUTCFullYear(), now.getUTCMonth())), to: iso(now) };
  if (kind === 'lastMonth')
    return {
      from: iso(first(now.getUTCFullYear(), now.getUTCMonth() - 1)),
      to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))),
    };
  return { from: iso(first(now.getUTCFullYear(), now.getUTCMonth() - 1)), to: iso(now) };
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
      <div className="flex gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setRange({ from: e.target.value, to })}
          className="field"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setRange({ from, to: e.target.value })}
          className="field"
        />
      </div>
      <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {s.count} {t('receiptsUnit')} · {t(space)}
        </p>
        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>
          {formatNZD(s.totalCents)}
        </p>
        {space === 'company' && (
          <p className="text-sm" style={{ color: 'var(--color-accent)' }}>
            GST {formatNZD(s.gstCents)} · {t('net')} {formatNZD(s.netCents)}
          </p>
        )}
        <ul className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {Object.entries(s.byCategory).map(([c, cents]) => (
            <li key={c} className="flex justify-between">
              <span>{c}</span>
              <span style={{ fontFamily: 'var(--font-numeric)' }}>{formatNZD(cents)}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={download}
        disabled={s.count === 0}
        className="rounded-xl py-3 font-bold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('downloadCsv')}
      </button>
    </div>
  );
}
