import { useEffect, useState } from 'react';
import { ChevronLeft, ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react';
import { db, type PhotoRow } from '../data/db';
import { softDeleteReceipt, updateReceipt } from '../data/repo';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { addCategoryToConfig, canonicalCategory, getConfig } from '../lib/settings';
import { AddChip } from './components/AddChip';
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
  const [itemsText, setItemsText] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
      setItemsText((r.items ?? []).join('\n'));
    });
    void db.photos.where('receiptId').equals(id).toArray().then(setPhotos);
  }, [id]);

  if (!receipt) return null;

  async function handleSave() {
    const totalCents = parseNZD(total);
    if (totalCents === null || !receipt) return;
    const gstCents = receipt.space === 'company' ? gstFromTotalCents(totalCents) : 0;
    const items = itemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await updateReceipt(id, {
      merchant,
      kind,
      totalCents,
      gstCents,
      date,
      category,
      note: note || undefined,
      items: items.length ? items : undefined,
    });
    onClose();
  }

  async function handleDelete() {
    await softDeleteReceipt(id);
    onClose();
  }

  return (
    <div className="screen-wrap push-in flex max-w-3xl flex-col gap-3 py-2">
      <button onClick={onClose} className="btn-secondary self-start">
        <ChevronLeft className="icon" aria-hidden="true" />
        {t('back')}
      </button>
      {photos.map((p) => (
        <div key={p.id} className="panel overflow-hidden">
          {p.kind === 'pdf' ? (
            <div className="flex justify-center p-4">
              <a
                className="btn-secondary inline-flex"
                href={URL.createObjectURL(p.full)}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="icon" aria-hidden="true" />
                {t('openPdf')} <ExternalLink className="icon" aria-hidden="true" />
              </a>
            </div>
          ) : (
            <img src={URL.createObjectURL(p.full)} className="w-full" alt={receipt.merchant} />
          )}
        </div>
      ))}
      {!editing ? (
        <>
          <div className="panel panel-pad">
            <p className="text-lg font-bold">{receipt.merchant}</p>
            <p
              className="amount text-3xl font-bold"
              style={{
                color: kindOf(receipt) === 'income' ? 'var(--color-accent)' : 'var(--color-danger)',
              }}
            >
              {kindOf(receipt) === 'income' ? '+' : '-'}
              {formatNZD(receipt.totalCents)}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              {formatDate(receipt.date, locale)} · {categoryLabel(receipt.category, locale)} ·{' '}
              {t(kindOf(receipt))} · {t(receipt.space)}
              {receipt.space === 'company' && ` · GST ${formatNZD(receipt.gstCents)}`}
            </p>
            {receipt.items && receipt.items.length > 0 && (
              <ul className="mt-2 text-sm">
                {receipt.items.map((it) => (
                  <li key={it} className="flex gap-1.5">
                    <span style={{ color: 'var(--color-ink-muted)' }}>•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            )}
            {receipt.note && (
              <p className="mt-2 text-sm" style={{ whiteSpace: 'pre-line' }}>
                {receipt.note}
              </p>
            )}
          </div>
          {!confirmingDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="btn-secondary flex-1"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <Pencil className="icon" aria-hidden="true" />
                {t('edit')}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="btn-secondary flex-1"
                style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
              >
                <Trash2 className="icon" aria-hidden="true" />
                {t('delete')}
              </button>
            </div>
          ) : (
            // 就地确认：取消保持中性默认，确认删除用 danger 实底标注不可逆
            <div className="panel panel-pad flex flex-col gap-2">
              <p className="text-sm font-semibold">{t('deleteConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmingDelete(false)} className="btn-secondary flex-1">
                  {t('cancel')}
                </button>
                <button
                  onClick={() => void handleDelete()}
                  className="btn-secondary flex-1"
                  style={{
                    background: 'var(--color-danger)',
                    color: 'var(--color-danger-ink)',
                  }}
                >
                  <Trash2 className="icon" aria-hidden="true" />
                  {t('confirmDelete')}
                </button>
              </div>
            </div>
          )}
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
            placeholder={t('totalInclGst')}
            aria-label={t('totalInclGst')}
            className="field amount"
          />
          <div className="segmented-row">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setCategory('');
                }}
                aria-pressed={kind === k}
                className="segmented-btn"
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
                className="chip-btn"
                style={
                  category === c
                    ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                    : { background: 'var(--color-surface-2)' }
                }
              >
                {categoryLabel(c, locale)}
              </button>
            ))}
            <AddChip
              onAdd={(name) => {
                if (!receipt) return;
                const next = addCategoryToConfig(receipt.space, kind, name);
                setCategory(canonicalCategory(next, receipt.space, kind, name));
              }}
            />
          </div>
          <textarea
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            placeholder={t('itemsPlaceholder')}
            rows={Math.min(6, Math.max(2, itemsText.split('\n').length))}
            className="field resize-none"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('note')}
            rows={Math.min(4, Math.max(1, note.split('\n').length))}
            className="field resize-none"
          />
          <button onClick={() => void handleSave()} className="btn-primary btn-glow w-full">
            {t('saveChanges')}
          </button>
        </>
      )}
    </div>
  );
}
