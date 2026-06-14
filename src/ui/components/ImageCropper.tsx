import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, X } from 'lucide-react';
import {
  cropProcessedFile,
  cropRectFromDisplay,
  type CropRect,
  type ProcessedFile,
} from '../../lib/image';
import { useT } from '../../lib/i18n';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  handle: Handle;
  pointerId: number;
  startX: number;
  startY: number;
  crop: CropRect;
}

interface ImageCropperProps {
  file: ProcessedFile;
  onCancel: () => void;
  onApply: (file: ProcessedFile) => void;
}

const MIN_CROP = 56;

function fitContain(sourceW: number, sourceH: number, boxW: number, boxH: number): CropRect {
  if (!sourceW || !sourceH || !boxW || !boxH) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(boxW / sourceW, boxH / sourceH);
  const w = sourceW * scale;
  const h = sourceH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

function defaultCrop(imageRect: CropRect): CropRect {
  const insetX = Math.min(28, imageRect.w * 0.08);
  const insetY = Math.min(28, imageRect.h * 0.08);
  return {
    x: imageRect.x + insetX,
    y: imageRect.y + insetY,
    w: imageRect.w - insetX * 2,
    h: imageRect.h - insetY * 2,
  };
}

function clampCrop(crop: CropRect, bounds: CropRect): CropRect {
  const w = Math.min(Math.max(crop.w, MIN_CROP), bounds.w);
  const h = Math.min(Math.max(crop.h, MIN_CROP), bounds.h);
  const x = Math.min(Math.max(crop.x, bounds.x), bounds.x + bounds.w - w);
  const y = Math.min(Math.max(crop.y, bounds.y), bounds.y + bounds.h - h);
  return { x, y, w, h };
}

function resizeCrop(
  handle: Handle,
  start: CropRect,
  dx: number,
  dy: number,
  bounds: CropRect,
): CropRect {
  if (handle === 'move') {
    return clampCrop({ ...start, x: start.x + dx, y: start.y + dy }, bounds);
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;

  left = Math.max(bounds.x, Math.min(left, right - MIN_CROP));
  right = Math.min(bounds.x + bounds.w, Math.max(right, left + MIN_CROP));
  top = Math.max(bounds.y, Math.min(top, bottom - MIN_CROP));
  bottom = Math.min(bounds.y + bounds.h, Math.max(bottom, top + MIN_CROP));

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function ImageCropper({ file, onCancel, onApply }: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const t = useT();

  useEffect(() => {
    const next = URL.createObjectURL(file.full);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imageRect = useMemo(
    () => fitContain(natural.w, natural.h, stage.w, stage.h),
    [natural.h, natural.w, stage.h, stage.w],
  );

  useEffect(() => {
    if (!imageRect.w || !imageRect.h) return;
    setCrop(defaultCrop(imageRect));
  }, [imageRect.h, imageRect.w, imageRect.x, imageRect.y]);

  function beginDrag(handle: Handle, e: React.PointerEvent<HTMLElement>) {
    if (!crop || !imageRect.w || !imageRect.h) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      crop,
    };
  }

  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    setCrop(
      resizeCrop(
        drag.handle,
        drag.crop,
        e.clientX - drag.startX,
        e.clientY - drag.startY,
        imageRect,
      ),
    );
  }

  function endDrag(e: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  async function applyCrop() {
    if (!crop || !imageRect.w || !natural.w || applying) return;
    setApplying(true);
    setError('');
    try {
      const sourceCrop = cropRectFromDisplay({
        sourceW: natural.w,
        sourceH: natural.h,
        imageRect,
        cropRect: crop,
      });
      onApply(await cropProcessedFile(file, sourceCrop));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cropError'));
      setApplying(false);
    }
  }

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
      >
        <button onClick={onCancel} className="btn-secondary min-h-11 px-3" aria-label={t('cancel')}>
          <X className="icon-lg" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-bold">{t('cropTitle')}</h2>
        <button
          onClick={() => imageRect.w && setCrop(defaultCrop(imageRect))}
          className="btn-secondary min-h-11 px-3"
          aria-label={t('resetCrop')}
        >
          <RotateCcw className="icon-lg" aria-hidden="true" />
        </button>
      </div>

      <div ref={stageRef} className="crop-stage mx-4 flex-1 rounded-xl">
        {url && (
          <img
            src={url}
            alt=""
            onLoad={(e) =>
              setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="absolute select-none"
            style={{
              left: imageRect.x,
              top: imageRect.y,
              width: imageRect.w,
              height: imageRect.h,
            }}
            draggable={false}
          />
        )}

        {crop && imageRect.w > 0 && (
          <div
            className="crop-frame"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            onPointerDown={(e) => beginDrag('move', e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
              <button
                key={handle}
                className={`crop-handle crop-handle-${handle}`}
                aria-label={t('resizeCrop')}
                onPointerDown={(e) => beginDrag(handle, e)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="sheet-in flex flex-col gap-2 px-4 py-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        {error && (
          <p className="panel px-3 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        <button
          onClick={() => void applyCrop()}
          disabled={applying || !crop}
          className="btn-primary w-full disabled:opacity-40"
        >
          <Check className="icon-lg" aria-hidden="true" />
          {applying ? t('applyingCrop') : t('applyCrop')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
