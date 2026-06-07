// 录入草稿：模块级内存单例——切 Tab（组件卸载）不丢任何内容（含照片 blob）。
// 刻意不持久化到 localStorage：照片 blob 无法序列化，半截草稿（有字没图）反而困惑。
import type { ProcessedFile } from './image';
import type { Kind } from '../data/types';

export interface CaptureDraft {
  files: ProcessedFile[];
  date: string;
  merchant: string;
  total: string;
  kind: Kind;
  category: string;
  note: string;
  gstOverride: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const emptyDraft = (): CaptureDraft => ({
  files: [],
  date: today(),
  merchant: '',
  total: '',
  kind: 'expense',
  category: '',
  note: '',
  gstOverride: null,
});

let draft: CaptureDraft = emptyDraft();

export const getDraft = (): CaptureDraft => draft;
export const setDraft = (d: CaptureDraft): void => {
  draft = d;
};
export const clearDraft = (): void => {
  draft = emptyDraft();
};

export const isDraftDirty = (d: CaptureDraft): boolean =>
  d.files.length > 0 || !!d.merchant.trim() || !!d.total.trim() || !!d.note.trim() || !!d.category;
