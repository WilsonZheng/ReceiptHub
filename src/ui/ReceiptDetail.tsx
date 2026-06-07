import { useEffect, useState } from 'react';
import { db, type PhotoRow } from '../data/db';
import { softDeleteReceipt, updateReceipt } from '../data/repo';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { getConfig } from '../lib/settings';
import { useLocale, useT } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { formatDate } from '../lib/dates';
import { DateField } from './components/DateField';
import { kindOf, type Kind, type Receipt } from '../data/types';

export function ReceiptDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    void db.receipts.get(id).then((r) => {
      if (!r) return;
      setReceipt(r);
      setKind(kindOf(r));
      setMerchant(r.merchant);
      setTotal((r.totalCents / 100).toFixed(2));
      setDate(r.date);
      setCategory(r.category);
      setNote(r.note ?? '');
    });
    void db.photos.where('receiptId').equals(id).toArray().then(setPhotos);
  }, [id]);

  if (!receipt) return null;

  async function handleSave() {
    const totalCents = parseNZD(total);
    if (totalCents === null || !receipt) return;
    const gstCents = receipt.space === 'company' ? gstFromTotalCents(totalCents) : 0;
    await updateReceipt(id, {
      merchant,
      kind,
      totalCents,
      gstCents,
      date,
      category,
      note: note || undefined,
    });
    onClose();
  }

  async function handleDelete() {
    if (confirm(t('deleteConfirm'))) {
      await softDeleteReceipt(id);
      onClose();
    }
  }

  return (
    <div className="push-in flex flex-col gap-3 py-2">
      <button onClick={onClose} className="btn-secondary self-start">
        {t('back')}
      </button>
      {photos.map((p) => (
        <div
          key={p.id}
          className="overflow-hidden rounded-xl"
          style={{ background: 'var(--color-surface)' }}
        >
          {p.kind === 'pdf' ? (
            <a
              className="block p-4 text-center underline"
              href={URL.createObjectURL(p.full)}
              target="_blank"
              rel="noreferrer"
            >
              {t('openPdf')}
            </a>
          ) : (
            <img src={URL.createObjectURL(p.full)} className="w-full" alt={receipt.merchant} />
          )}
        </div>
      ))}
      {!editing ? (
        <>
          <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
            <p className="text-lg font-bold">{receipt.merchant}</p>
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(receipt.totalCents)}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              {formatDate(receipt.date, locale)} · {categoryLabel(receipt.category, locale)} ·{' '}
              {t(kindOf(receipt))} · {t(receipt.space)}
              {receipt.space === 'company' && ` · GST ${formatNZD(receipt.gstCents)}`}
            </p>
            {receipt.note && <p className="mt-2 text-sm">{receipt.note}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex-1 rounded-xl py-2 font-semibold"
              style={{ background: 'var(--color-surface-2)' }}
            >
              {t('edit')}
            </button>
            <button
              onClick={() => void handleDelete()}
              className="flex-1 rounded-xl py-2 font-semibold"
              style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
            >
              {t('delete')}
            </button>
          </div>
        </>
      ) : (
        <>
          <DateField value={date} onChange={setDate} />
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={t('merchant')}
            className="field"
          />
          <input
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="field"
          />
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setCategory('');
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={
                  kind === k
                    ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
                }
              >
                {t(k)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {getConfig().categories[receipt.space][kind].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="rounded-full px-3 py-1.5 text-xs"
                style={
                  category === c
                    ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                    : { background: 'var(--color-surface-2)' }
                }
              >
                {categoryLabel(c, locale)}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('note')}
            className="field"
          />
          <button
            onClick={() => void handleSave()}
            className="rounded-xl py-3 font-bold"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
          >
            {t('saveChanges')}
          </button>
        </>
      )}
    </div>
  );
}
