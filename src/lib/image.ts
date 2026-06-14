import type { PhotoKind } from '../data/types';

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 300;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DisplayCropInput {
  sourceW: number;
  sourceH: number;
  imageRect: CropRect;
  cropRect: CropRect;
}

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export function pickKind(mime: string): PhotoKind {
  return mime === 'application/pdf' ? 'pdf' : 'webp';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeCropRect(rect: CropRect, sourceW: number, sourceH: number): CropRect {
  const x = clamp(Math.floor(rect.x), 0, Math.max(0, sourceW - 1));
  const y = clamp(Math.floor(rect.y), 0, Math.max(0, sourceH - 1));
  const right = clamp(Math.ceil(rect.x + rect.w), x + 1, sourceW);
  const bottom = clamp(Math.ceil(rect.y + rect.h), y + 1, sourceH);
  return { x, y, w: right - x, h: bottom - y };
}

export function cropRectFromDisplay({
  sourceW,
  sourceH,
  imageRect,
  cropRect,
}: DisplayCropInput): CropRect {
  const left = Math.max(imageRect.x, cropRect.x);
  const top = Math.max(imageRect.y, cropRect.y);
  const right = Math.min(imageRect.x + imageRect.w, cropRect.x + cropRect.w);
  const bottom = Math.min(imageRect.y + imageRect.h, cropRect.y + cropRect.h);
  if (right <= left || bottom <= top) return { x: 0, y: 0, w: sourceW, h: sourceH };

  return normalizeCropRect(
    {
      x: ((left - imageRect.x) / imageRect.w) * sourceW,
      y: ((top - imageRect.y) / imageRect.h) * sourceH,
      w: ((right - left) / imageRect.w) * sourceW,
      h: ((bottom - top) / imageRect.h) * sourceH,
    },
    sourceW,
    sourceH,
  );
}

async function drawToBlob(
  bitmap: ImageBitmap,
  max: number,
  crop: CropRect = { x: 0, y: 0, w: bitmap.width, h: bitmap.height },
): Promise<{ blob: Blob; kind: PhotoKind }> {
  const src = normalizeCropRect(crop, bitmap.width, bitmap.height);
  const { w, h } = fitWithin(src.w, src.h, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, w, h);
  const tryType = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const webp = await tryType('image/webp', 0.8);
  if (webp && webp.type === 'image/webp') return { blob: webp, kind: 'webp' };
  // Safari 旧版不支持 webp 编码 → JPEG 兜底
  const jpeg = await tryType('image/jpeg', 0.8);
  if (!jpeg) throw new Error('canvas encoding failed');
  return { blob: jpeg, kind: 'jpeg' };
}

export interface ProcessedFile {
  full: Blob;
  thumb?: Blob;
  kind: PhotoKind;
}

export async function processFile(file: File): Promise<ProcessedFile> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('PDF over 20MB');
    return { full: file, kind: 'pdf' };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const full = await drawToBlob(bitmap, MAX_EDGE);
    const thumb = await drawToBlob(bitmap, THUMB_EDGE);
    return { full: full.blob, thumb: thumb.blob, kind: full.kind };
  } finally {
    bitmap.close();
  }
}

export async function cropProcessedFile(
  file: ProcessedFile,
  crop: CropRect,
): Promise<ProcessedFile> {
  if (file.kind === 'pdf') return file;
  const bitmap = await createImageBitmap(file.full);
  try {
    const full = await drawToBlob(bitmap, MAX_EDGE, crop);
    const thumb = await drawToBlob(bitmap, THUMB_EDGE, crop);
    return { full: full.blob, thumb: thumb.blob, kind: full.kind };
  } finally {
    bitmap.close();
  }
}
