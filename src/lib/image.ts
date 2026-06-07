import type { PhotoKind } from '../data/types';

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 300;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export function pickKind(mime: string): PhotoKind {
  return mime === 'application/pdf' ? 'pdf' : 'webp';
}

async function drawToBlob(
  bitmap: ImageBitmap,
  max: number,
): Promise<{ blob: Blob; kind: PhotoKind }> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
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
