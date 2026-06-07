import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'zh';
const STORAGE_KEY = 'rh.locale';

const en = {
  // tabs
  tabCapture: 'Capture',
  tabReceipts: 'Receipts',
  tabExport: 'Export',
  tabSettings: 'Settings',
  // spaces
  company: 'Company',
  personal: 'Personal',
  all: 'All',
  personalSuffix: ' · personal',
  // capture
  takePhoto: '📷 Take photo',
  uploadLabel: 'Upload from library / files (images & PDF)',
  uploadDesktopHint: ' — or drag & drop / ⌘V',
  merchant: 'Merchant',
  totalInclGst: 'Total (incl. GST)',
  noteOptional: 'Note (optional)',
  note: 'Note',
  noGst: 'No GST',
  gstAuto: 'GST auto',
  save: 'Save',
  removeFile: 'Remove file',
  // receipts
  searchPlaceholder: '⌕ Search merchant, note, amount…',
  noReceiptsYet: 'No receipts yet',
  noReceiptsMatch: 'No receipts matching search',
  // detail
  back: '← Back',
  openPdf: 'Open PDF',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirm: 'Delete this receipt?',
  saveChanges: 'Save changes',
  // export
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last2Months: 'Last 2 months',
  receiptsUnit: 'receipts',
  net: 'Net',
  downloadCsv: 'Download CSV',
  // settings
  sync: 'Sync',
  pendingUnit: 'pending',
  photosUnit: 'photos',
  dataRepo: 'data repo',
  syncNow: 'Sync now',
  categories: 'Categories',
  newCategory: 'New category',
  add: 'Add',
  access: 'Access',
  clearPat: 'Clear PAT & lock',
  preferences: 'Preferences',
  language: 'Language',
  theme: 'Theme',
  dark: 'Dark',
  light: 'Light',
  // sync status
  status_idle: 'synced',
  status_syncing: 'syncing',
  status_offline: 'offline',
  status_error: 'error',
  // lock & banner
  lockInstruction: 'Paste a fine-grained PAT with Contents read/write on',
  unlock: 'Unlock',
  authBanner: 'GitHub token rejected — update your PAT in Settings.',
  dismiss: 'Dismiss',
} as const;

export type MsgKey = keyof typeof en;

// Record<MsgKey, string> 让 TS 编译期强制中英文 key 完全对齐：漏译/多译都编译失败
const zh: Record<MsgKey, string> = {
  tabCapture: '拍照',
  tabReceipts: '票据',
  tabExport: '导出',
  tabSettings: '设置',
  company: '公司',
  personal: '个人',
  all: '全部',
  personalSuffix: ' · 个人',
  takePhoto: '📷 拍照录入',
  uploadLabel: '从相册 / 文件上传（图片和 PDF）',
  uploadDesktopHint: '——也可拖拽 / ⌘V 粘贴',
  merchant: '商家',
  totalInclGst: '总额（含 GST）',
  noteOptional: '备注（可选）',
  note: '备注',
  noGst: '无 GST',
  gstAuto: 'GST 自动',
  save: '保存',
  removeFile: '移除文件',
  searchPlaceholder: '⌕ 搜索商家、备注、金额…',
  noReceiptsYet: '还没有票据',
  noReceiptsMatch: '没有匹配的票据',
  back: '← 返回',
  openPdf: '打开 PDF',
  edit: '编辑',
  delete: '删除',
  deleteConfirm: '删除这张票据？',
  saveChanges: '保存修改',
  thisMonth: '本月',
  lastMonth: '上月',
  last2Months: '近两月',
  receiptsUnit: '张票据',
  net: '净额',
  downloadCsv: '下载 CSV',
  sync: '同步',
  pendingUnit: '待同步',
  photosUnit: '张照片',
  dataRepo: '数据仓库',
  syncNow: '立即同步',
  categories: '分类',
  newCategory: '新分类',
  add: '添加',
  access: '访问',
  clearPat: '清除 PAT 并锁定',
  preferences: '偏好',
  language: '语言',
  theme: '主题',
  dark: '深色',
  light: '浅色',
  status_idle: '已同步',
  status_syncing: '同步中',
  status_offline: '离线',
  status_error: '错误',
  lockInstruction: '粘贴一个 fine-grained PAT（需要以下仓库的 Contents 读写权限）',
  unlock: '解锁',
  authBanner: 'GitHub token 被拒绝——请到设置中更新 PAT。',
  dismiss: '关闭',
};

const dicts: Record<Locale, Record<MsgKey, string>> = { en, zh };

function detect(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  }
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) return 'zh';
  return 'en';
}

let locale: Locale = detect();
const listeners = new Set<() => void>();

export function setLocale(l: Locale): void {
  locale = l;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
  listeners.forEach((fn) => fn());
}

export const getLocale = (): Locale => locale;

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

export function useT(): (k: MsgKey) => string {
  const l = useLocale();
  return (k) => dicts[l][k];
}
