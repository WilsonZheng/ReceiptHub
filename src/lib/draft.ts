// 录入草稿：模块级内存单例——切 Tab（组件卸载）不丢任何内容（含照片 blob）。
// 刻意不持久化到 localStorage：照片 blob 无法序列化，半截草稿（有字没图）反而困惑。
import type { ProcessedFile } from './image';
import type { Kind } from '../data/types';
import { localToday } from './dates';

export interface CaptureDraft {
  files: ProcessedFile[];
  date: string;
  merchant: string;
  total: string;
  kind: Kind;
  category: string;
  items: string; // textarea 原文，每行一项
  note: string;
  gstOverride: number | null;
}

export const emptyDraft = (): CaptureDraft => ({
  files: [],
  date: localToday(),
  merchant: '',
  total: '',
  kind: 'expense',
  category: '',
  items: '',
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
  d.files.length > 0 ||
  !!d.merchant.trim() ||
  !!d.total.trim() ||
  !!d.note.trim() ||
  !!d.items.trim() ||
  !!d.category;
