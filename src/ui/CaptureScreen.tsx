import { useEffect, useRef, useState } from 'react';
import { processFile, type ProcessedFile } from '../lib/image';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { getConfig } from '../lib/settings';
import { useT } from '../lib/i18n';
import { saveReceipt } from '../data/repo';
import { db } from '../data/db';
import type { Space } from '../data/types';

const today = () => new Date().toISOString().slice(0, 10);

export function CaptureScreen({ space, onSaved }: { space: Space; onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [date, setDate] = useState(today());
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [gstOverride, setGstOverride] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [merchants, setMerchants] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const t = useT();

  useEffect(() => {
    void db.receipts
      .orderBy('updatedAt')
      .reverse()
      .limit(200)
      .toArray()
      .then((rs) => setMerchants([...new Set(rs.map((r) => r.merchant))]));
  }, []);

  // 桌面: 拖拽 + ⌘V 粘贴
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => void addFiles([...(e.clipboardData?.files ?? [])]);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      void addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDrag);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDrag);
    };
  }, []);

  async function addFiles(list: File[]) {
    if (!list.length) return;
    try {
      const processed = await Promise.all(list.map(processFile));
      setFiles((cur) => [...cur, ...processed]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'file processing failed');
    }
  }

  const totalCents = parseNZD(total);
  const gstCents = gstOverride ?? (totalCents !== null ? gstFromTotalCents(totalCents) : 0);
  const canSave = files.length > 0 && merchant.trim() && totalCents !== null && category && !saving;

  async function handleSave() {
    if (!canSave || totalCents === null) return;
    setSaving(true);
    try {
      await saveReceipt({
        space,
        date,
        merchant,
        totalCents,
        gstCents: space === 'company' ? gstCents : 0,
        category,
        note,
        files,
      });
      setFiles([]);
      setMerchant('');
      setTotal('');
      setNote('');
      setCategory('');
      setGstOverride(null);
      setDate(today());
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const categories = getConfig().categories[space];

  return (
    <div className="flex flex-col gap-3 py-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      <button
        onClick={() => cameraRef.current?.click()}
        className="rounded-xl py-10 text-lg font-bold"
        style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
      >
        {t('takePhoto')}
      </button>
      <button
        onClick={() => libraryRef.current?.click()}
        className="text-sm underline"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {t('uploadLabel')}
        <span className="hidden sm:inline">{t('uploadDesktopHint')}</span>
      </button>

      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
              style={{ background: 'var(--color-surface-2)' }}
            >
              {f.kind === 'pdf' ? (
                <span className="flex h-full items-center justify-center text-xs">PDF</span>
              ) : (
                <img
                  src={URL.createObjectURL(f.thumb ?? f.full)}
                  className="h-full w-full object-cover"
                  alt=""
                />
              )}
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 px-1 text-xs"
                aria-label={t('removeFile')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
      <input
        list="merchants"
        placeholder={t('merchant')}
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        className="field"
      />
      <datalist id="merchants">
        {merchants.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        inputMode="decimal"
        placeholder={t('totalInclGst')}
        value={total}
        onChange={(e) => {
          setTotal(e.target.value);
          setGstOverride(null);
        }}
        className="field"
      />

      {space === 'company' && totalCents !== null && (
        <div
          className="flex items-center justify-between text-sm"
          style={{ color: 'var(--color-ink-muted)' }}
        >
          <span style={{ fontFamily: 'var(--font-numeric)' }}>GST {formatNZD(gstCents)}</span>
          <button
            onClick={() => setGstOverride(gstOverride === 0 ? null : 0)}
            className="underline"
          >
            {gstOverride === 0 ? t('gstAuto') : t('noGst')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={
              category === c
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
            }
          >
            {c}
          </button>
        ))}
      </div>

      <input
        placeholder={t('noteOptional')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="field"
      />
      <button
        disabled={!canSave}
        onClick={() => void handleSave()}
        className="rounded-xl py-3 font-bold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('save')}
      </button>
    </div>
  );
}
