import { useEffect, useRef, useState } from 'react';
import { Camera, Crop as CropIcon, Sparkles, UploadCloud } from 'lucide-react';
import { processFile, type ProcessedFile } from '../lib/image';
import { clearDraft, emptyDraft, getDraft, isDraftDirty, setDraft } from '../lib/draft';
import { localToday } from '../lib/dates';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { extractReceipt, ExtractError } from '../lib/extract';
import { addCategoryToConfig, canonicalCategory, getAiKey, getConfig } from '../lib/settings';
import { AddChip } from './components/AddChip';
import { useLocale, useT } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
import { saveReceipt } from '../data/repo';
import { db } from '../data/db';
import { DateField } from './components/DateField';
import { ImageCropper } from './components/ImageCropper';
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
  const [cropIndex, setCropIndex] = useState<number | null>(null);
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

  async function addFiles(list: File[], opts: { openCrop?: boolean } = {}) {
    if (!list.length) return;
    try {
      const processed = await Promise.all(list.map(processFile));
      const firstImage = processed.findIndex((f) => f.kind !== 'pdf');
      const startIndex = files.length;
      setFiles((cur) => [...cur, ...processed]);
      if (opts.openCrop && firstImage >= 0) setCropIndex(startIndex + firstImage);
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
  const cropFile = cropIndex !== null ? files[cropIndex] : null;

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
      if (r.category) {
        setTimeout(() => setCategory(r.category!), 0);
      } else if (r.newCategory) {
        // AI 提名的新分类：自动加入该空间该收支类型并选中
        const k = r.kind ?? kind;
        const next = addCategoryToConfig(space, k, r.newCategory);
        const canonical = canonicalCategory(next, space, k, r.newCategory);
        setTimeout(() => setCategory(canonical), 0);
      }
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
    <div className="screen-wrap grid gap-3 py-2 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])], { openCrop: true });
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

      <div className="flex flex-col gap-3">
        <button
          onClick={() => cameraRef.current?.click()}
          className="panel flex min-h-36 flex-col items-center justify-center gap-3 border-dashed py-10 text-lg font-bold"
        >
          <Camera className="h-8 w-8" aria-hidden="true" />
          {t('takePhoto')}
        </button>
        <button onClick={() => libraryRef.current?.click()} className="btn-secondary w-full">
          <UploadCloud className="icon-lg" aria-hidden="true" />
          {t('uploadLabel')}
          <span className="hidden sm:inline">{t('uploadDesktopHint')}</span>
        </button>
        {/* iOS 的「浏览」即系统 Files：Google Drive/Dropbox 等都是其官方接入方 */}
        <p
          className="-mt-1 text-center text-xs sm:hidden"
          style={{ color: 'var(--color-ink-muted)' }}
        >
          {t('driveHint')}
        </p>

        <div className="segmented-row">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
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

        {files.length > 0 && (
          <div className="panel flex gap-2 overflow-x-auto p-2">
            {files.map((f, i) => (
              <div
                key={i}
                className="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl sm:h-20 sm:w-20"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <button
                  type="button"
                  onClick={() =>
                    f.kind === 'pdf' ? window.open(URL.createObjectURL(f.full)) : setPreview(f)
                  }
                  className="h-full w-full"
                  aria-label={f.kind === 'pdf' ? t('openPdf') : t('previewPhoto')}
                >
                  {f.kind === 'pdf' ? (
                    <span className="flex h-full items-center justify-center text-xs font-bold">
                      PDF
                    </span>
                  ) : (
                    <img
                      src={URL.createObjectURL(f.thumb ?? f.full)}
                      className="h-full w-full object-cover"
                      alt=""
                    />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cropIndex === i) setCropIndex(null);
                    setFiles(files.filter((_, j) => j !== i));
                  }}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'rgba(0,0,0,.62)', color: 'var(--color-danger-ink)' }}
                  aria-label={t('removeFile')}
                >
                  ✕
                </button>
                {f.kind !== 'pdf' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCropIndex(i);
                    }}
                    className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ background: 'rgba(0,0,0,.62)', color: '#fff' }}
                    aria-label={t('cropPhoto')}
                  >
                    <CropIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
      {cropFile && cropFile.kind !== 'pdf' && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropIndex(null)}
          onApply={(next) => {
            setFiles((cur) => cur.map((f, i) => (i === cropIndex ? next : f)));
            setCropIndex(null);
            setError('');
          }}
        />
      )}
      {/* 有照片且配了 key 才出现：一键 AI 识别填表 */}
      <div className="flex flex-col gap-3">
        {files.length > 0 && aiKey && (
          <button
            onClick={() => void handleExtract()}
            disabled={extracting}
            className="btn-secondary w-full"
            style={{
              borderColor: 'var(--color-accent)',
              color: 'var(--color-accent)',
              background: 'transparent',
            }}
          >
            <Sparkles className="icon" aria-hidden="true" />
            {extracting ? t('aiExtracting') : t('aiExtract')}
          </button>
        )}

        {error && (
          <p className="panel px-3 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
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
          className="field amount"
        />

        {space === 'company' && totalCents !== null && (
          <div className="panel flex items-center justify-between px-3 py-2 text-sm muted">
            <span className="amount">GST {formatNZD(gstCents)} · × 3/23</span>
            <button
              onClick={() => setGstOverride(gstOverride === 0 ? null : 0)}
              className="btn-secondary min-h-9 px-3 py-1 text-xs"
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
              className="chip-btn"
              style={
                category === c
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                  : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
              }
            >
              {categoryLabel(c, locale)}
            </button>
          ))}
          <AddChip
            onAdd={(name) => {
              const next = addCategoryToConfig(space, kind, name);
              setCategory(canonicalCategory(next, space, kind, name));
            }}
          />
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
          className="btn-primary btn-glow w-full disabled:opacity-40 disabled:shadow-none"
        >
          {t('save')}
        </button>
        {isDraftDirty({
          files,
          date,
          merchant,
          total,
          kind,
          category,
          items,
          note,
          gstOverride,
        }) && (
          <button
            onClick={discard}
            className="self-center text-xs underline"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {t('discardDraft')}
          </button>
        )}
      </div>
    </div>
  );
}
