import { useEffect, useRef, useState } from 'react';
import { processFile, type ProcessedFile } from '../lib/image';
import { clearDraft, emptyDraft, getDraft, isDraftDirty, setDraft } from '../lib/draft';
import { localToday } from '../lib/dates';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { extractReceipt, ExtractError } from '../lib/extract';
import { getAiKey, getConfig } from '../lib/settings';
import { useLocale, useT } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { saveReceipt } from '../data/repo';
import { db } from '../data/db';
import { DateField } from './components/DateField';
import type { Kind, Space } from '../data/types';

export function CaptureScreen({ space, onSaved }: { space: Space; onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // 从草稿恢复：切走再切回，所有内容（含照片）都还在
  const d0 = getDraft();
  const [files, setFiles] = useState<ProcessedFile[]>(d0.files);
  const [date, setDate] = useState(d0.date);
  const [merchant, setMerchant] = useState(d0.merchant);
  const [total, setTotal] = useState(d0.total);
  const [gstOverride, setGstOverride] = useState<number | null>(d0.gstOverride);
  const [kind, setKind] = useState<Kind>(d0.kind);
  const [category, setCategory] = useState(d0.category);
  const [items, setItems] = useState(d0.items);
  const [note, setNote] = useState(d0.note);
  const [merchants, setMerchants] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ProcessedFile | null>(null);
  const [extracting, setExtracting] = useState(false);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    void db.receipts
      .orderBy('updatedAt')
      .reverse()
      .limit(200)
      .toArray()
      .then((rs) => setMerchants([...new Set(rs.map((r) => r.merchant))]));
  }, []);

  // 空间或收支类型切换时，已选分类可能不在新列表里——重置（首渲染跳过，保护草稿恢复的分类）
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setCategory('');
  }, [space, kind]);

  // 每次变更写回草稿
  useEffect(() => {
    setDraft({ files, date, merchant, total, kind, category, items, note, gstOverride });
  }, [files, date, merchant, total, kind, category, items, note, gstOverride]);

  function discard() {
    clearDraft();
    const e = emptyDraft();
    setFiles(e.files);
    setDate(e.date);
    setMerchant('');
    setTotal('');
    setKind('expense');
    setCategory('');
    setItems('');
    setNote('');
    setGstOverride(null);
    setError('');
  }

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
        kind,
        date,
        merchant,
        totalCents,
        gstCents: space === 'company' ? gstCents : 0,
        category,
        note,
        items: items
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        files,
      });
      clearDraft();
      setFiles([]);
      setMerchant('');
      setTotal('');
      setNote('');
      setItems('');
      setCategory('');
      setGstOverride(null);
      setDate(localToday());
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const categories = getConfig().categories[space][kind];
  const aiKey = getAiKey();

  // 用原图（非缩略图）送 Gemini：分辨率决定识别质量
  async function handleExtract() {
    if (!aiKey || !files.length || extracting) return;
    setExtracting(true);
    setError('');
    try {
      // 全部照片一起送（同一票据的多页/多张），extract 内部上限 4 张
      const r = await extractReceipt(
        files.map((f) => ({ blob: f.full, kind: f.kind })),
        { apiKey: aiKey, categories: getConfig().categories[space], locale },
      );
      if (r.kind) setKind(r.kind);
      if (r.merchant) setMerchant(r.merchant);
      if (r.date) setDate(r.date);
      if (r.totalCents !== undefined) {
        setTotal((r.totalCents / 100).toFixed(2));
        setGstOverride(null);
      }
      if (r.items?.length) setItems(r.items.join('\n'));
      if (r.note) setNote(r.note);
      // setKind 的 effect 会清空 category，这里用 setTimeout 排到其后
      if (r.category) setTimeout(() => setCategory(r.category!), 0);
    } catch (e) {
      if (e instanceof ExtractError && e.reason === 'auth') setError(t('aiErrAuth'));
      else if (e instanceof ExtractError && e.reason === 'rate_limit') setError(t('aiErrRate'));
      else if (e instanceof ExtractError && e.reason === 'network') setError(t('aiErrNetwork'));
      else setError(t('aiErrOther'));
    } finally {
      setExtracting(false);
    }
  }

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
      <button onClick={() => libraryRef.current?.click()} className="btn-secondary w-full">
        {t('uploadLabel')}
        <span className="hidden sm:inline">{t('uploadDesktopHint')}</span>
      </button>
      {/* iOS 的「浏览」即系统 Files：Google Drive/Dropbox 等都是其官方接入方 */}
      <p
        className="-mt-1 text-center text-[10px] sm:hidden"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {t('driveHint')}
      </p>

      <div className="flex gap-2">
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
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

      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() =>
                f.kind === 'pdf' ? window.open(URL.createObjectURL(f.full)) : setPreview(f)
              }
              className="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg"
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
                onClick={(e) => {
                  e.stopPropagation();
                  setFiles(files.filter((_, j) => j !== i));
                }}
                className="absolute right-0 top-0 rounded-bl-lg px-1.5 py-0.5 text-xs"
                style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}
                aria-label={t('removeFile')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 点缩略图全屏预览，点任意处关闭 */}
      {preview && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.88)' }}
          onClick={() => setPreview(null)}
        >
          <img
            src={URL.createObjectURL(preview.full)}
            className="zoom-in max-h-full max-w-full rounded-lg object-contain"
            alt=""
          />
        </div>
      )}
      {/* 有照片且配了 key 才出现：一键 AI 识别填表 */}
      {files.length > 0 && aiKey && (
        <button
          onClick={() => void handleExtract()}
          disabled={extracting}
          className="rounded-xl py-2.5 text-sm font-bold disabled:opacity-60"
          style={{
            border: '1.5px solid var(--color-accent)',
            color: 'var(--color-accent)',
            background: 'transparent',
          }}
        >
          {extracting ? t('aiExtracting') : t('aiExtract')}
        </button>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <DateField value={date} onChange={setDate} />
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
            {categoryLabel(c, locale)}
          </button>
        ))}
      </div>

      <textarea
        placeholder={t('itemsPlaceholder')}
        value={items}
        onChange={(e) => setItems(e.target.value)}
        rows={Math.min(6, Math.max(2, items.split('\n').length))}
        className="field resize-none"
      />
      <textarea
        placeholder={t('noteOptional')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={Math.min(4, Math.max(1, note.split('\n').length))}
        className="field resize-none"
      />
      <button
        disabled={!canSave}
        onClick={() => void handleSave()}
        className="btn-glow rounded-xl py-3 font-bold disabled:opacity-40 disabled:shadow-none"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('save')}
      </button>
      {isDraftDirty({ files, date, merchant, total, kind, category, items, note, gstOverride }) && (
        <button
          onClick={discard}
          className="self-center text-xs underline"
          style={{ color: 'var(--color-ink-muted)' }}
        >
          {t('discardDraft')}
        </button>
      )}
    </div>
  );
}
