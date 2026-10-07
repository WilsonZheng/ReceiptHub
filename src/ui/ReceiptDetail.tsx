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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold muted">{label}</span>
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

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
  const [noGst, setNoGst] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();

  function resetForm(r: Receipt) {
    setKind(kindOf(r));
    setMerchant(r.merchant);
    setTotal((r.totalCents / 100).toFixed(2));
    setDate(r.date);
    setCategory(r.category);
    setNote(r.note ?? '');
    setItemsText((r.items ?? []).join('\n'));
    // 存的时候选了"无 GST"——编辑时保持，不能悄悄按 3/23 重算
    setNoGst(r.space === 'company' && r.gstCents === 0 && r.totalCents > 0);
  }

  useEffect(() => {
    void db.receipts.get(id).then((r) => {
      if (!r) return;
      setReceipt(r);
      resetForm(r);
    });
    void db.photos.where('receiptId').equals(id).toArray().then(setPhotos);
  }, [id]);

  // 每张照片只建一次 object URL，离开时释放（之前每次渲染都新建，会泄漏内存）。
  // 建和释放放在同一个 effect 里：StrictMode 下 effect 会跑两遍，分开写会把还在用的 URL 释放掉
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const created = photos.map((p) => URL.createObjectURL(p.full));
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  // Esc：先关大图，再退出编辑，最后返回列表（桌面键盘用户的退出路径）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.sheet-in')) return; // 日期抽屉自己处理
      if (zoomUrl) setZoomUrl(null);
      else if (editing) setEditing(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomUrl, editing, onClose]);

  if (!receipt) return null;

  const catLabels = getConfig().labels;
  const isCompany = receipt.space === 'company';
  const totalCents = parseNZD(total);
  const gstCents = !isCompany || noGst || totalCents === null ? 0 : gstFromTotalCents(totalCents);
  const canSave = totalCents !== null && merchant.trim() !== '' && category !== '';
  const sign = kindOf(receipt) === 'income' ? '+' : '-';

  async function handleSave() {
    if (totalCents === null || !receipt || !canSave) return;
    const items = itemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await updateReceipt(id, {
      merchant: merchant.trim(),
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

  function cancelEdit() {
    if (receipt) resetForm(receipt);
    setEditing(false);
  }

  async function handleDelete() {
    await softDeleteReceipt(id);
    onClose();
  }

  const photoList = photos.map((p, i) =>
    !urls[i] ? null : (
      <div key={p.id} className="panel overflow-hidden">
        {p.kind === 'pdf' ? (
          <div className="flex justify-center p-4">
            <a
              className="btn-secondary inline-flex"
              href={urls[i]}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="icon" aria-hidden="true" />
              {t('openPdf')} <ExternalLink className="icon" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setZoomUrl(urls[i])}
            aria-label={t('previewPhoto')}
            className="block w-full"
          >
            <img src={urls[i]} className="w-full" alt={receipt.merchant} />
          </button>
        )}
      </div>
    ),
  );

  return (
    <div className="screen-wrap push-in flex max-w-3xl flex-col gap-3 py-2">
      <button onClick={editing ? cancelEdit : onClose} className="btn-secondary self-start pl-2">
        <ChevronLeft className="icon-lg" aria-hidden="true" />
        {editing ? t('cancel') : t('back')}
      </button>

      {!editing ? (
        <>
          {/* 数据在前、照片在后：长票据照片不再把金额挤到屏幕外 */}
          <div className="panel panel-pad">
            <p className="text-lg font-bold">{receipt.merchant}</p>
            <p
              className="amount text-3xl font-bold"
              style={{
                color: kindOf(receipt) === 'income' ? 'var(--color-accent)' : 'var(--color-danger)',
              }}
            >
              {sign}
              {formatNZD(receipt.totalCents)}
            </p>
            <div className="mt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <InfoRow label={t('date')}>{formatDate(receipt.date, locale)}</InfoRow>
              <InfoRow label={t('category')}>
                {categoryLabel(receipt.category, locale, catLabels)}
              </InfoRow>
              <InfoRow label={t('kind')}>
                {t(kindOf(receipt))} · {t(receipt.space)}
              </InfoRow>
              {isCompany && (
                <>
                  <InfoRow label="GST">
                    <span className="amount">{formatNZD(receipt.gstCents)}</span>
                  </InfoRow>
                  <InfoRow label={t('exGst')}>
                    <span className="amount">
                      {formatNZD(receipt.totalCents - receipt.gstCents)}
                    </span>
                  </InfoRow>
                </>
              )}
            </div>
            {receipt.items && receipt.items.length > 0 && (
              <ul className="mt-2 text-sm">
                {receipt.items.map((it, i) => (
                  <li key={i} className="flex gap-1.5">
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
              <button onClick={() => setEditing(true)} className="btn-secondary flex-1">
                <Pencil className="icon" aria-hidden="true" />
                {t('edit')}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="btn-secondary flex-1"
                style={{ color: 'var(--color-danger)' }}
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
          {photoList}
        </>
      ) : (
        <>
          <Labeled label={t('date')}>
            <DateField value={date} onChange={setDate} />
          </Labeled>
          <Labeled label={t('merchant')}>
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={t('merchant')}
              className="field"
            />
          </Labeled>
          <Labeled label={t('totalInclGst')}>
            <input
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder={t('totalInclGst')}
              aria-label={t('totalInclGst')}
              className="field amount"
            />
          </Labeled>
          {isCompany && totalCents !== null && (
            <div className="panel flex items-center justify-between px-3 py-2 text-sm muted">
              <span className="amount">
                GST {formatNZD(gstCents)}
                {!noGst && ' · × 3/23'}
              </span>
              <button
                onClick={() => setNoGst(!noGst)}
                className="btn-secondary min-h-9 px-3 py-1 text-xs"
              >
                {noGst ? t('gstAuto') : t('noGst')}
              </button>
            </div>
          )}
          <Labeled label={t('kind')}>
            <div className="segmented-row">
              {(['expense', 'income'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === kind) return;
                    setKind(k);
                    setCategory('');
                  }}
                  aria-pressed={kind === k}
                  className="segmented-btn flex-1"
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
          </Labeled>
          <Labeled label={t('category')}>
            <div className="flex flex-wrap gap-2">
              {getConfig().categories[receipt.space][kind].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="chip-btn"
                  style={
                    category === c
                      ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                      : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
                  }
                >
                  {categoryLabel(c, locale, catLabels)}
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
          </Labeled>
          <Labeled label={t('items')}>
            <textarea
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              placeholder={t('itemsPlaceholder')}
              rows={Math.min(6, Math.max(2, itemsText.split('\n').length))}
              className="field resize-none"
            />
          </Labeled>
          <Labeled label={t('note')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('note')}
              rows={Math.min(4, Math.max(1, note.split('\n').length))}
              className="field resize-none"
            />
          </Labeled>
          <div className="flex gap-2">
            <button onClick={cancelEdit} className="btn-secondary min-h-[52px] flex-1">
              {t('cancel')}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="btn-primary btn-glow flex-[2] disabled:opacity-40 disabled:shadow-none"
            >
              {t('saveChanges')}
            </button>
          </div>
        </>
      )}

      {/* 点照片全屏查看，点任意处关闭 */}
      {zoomUrl && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.88)' }}
          onClick={() => setZoomUrl(null)}
        >
          <img
            src={zoomUrl}
            className="zoom-in max-h-full max-w-full rounded-lg object-contain"
            alt=""
          />
        </div>
      )}
    </div>
  );
}
