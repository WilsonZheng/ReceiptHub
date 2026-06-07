import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'zh';
const STORAGE_KEY = 'rh.locale';

const en = {
  // tabs
  tabCapture: 'Capture',
  tabReceipts: 'Receipts',
  tabStats: 'Stats',
  tabExport: 'Export',
  tabSettings: 'Settings',
  more: 'More',
  vsLastMonth: 'vs last month',
  last6Months: 'Last 6 months',
  thisYear: 'This year',
  allTime: 'All',
  balance: 'Net',
  avgMonthly: 'Avg monthly spend',
  trend: 'Trend',
  topCategories: 'Top categories',
  topMerchants: 'Top merchants',
  gstPeriod: 'GST · last 2 months',
  noData: 'No data yet — capture some receipts first',
  // spaces & kinds
  company: 'Company',
  personal: 'Personal',
  all: 'All',
  income: 'Income',
  expense: 'Expense',
  gstPaid: 'GST paid',
  gstCollected: 'GST collected',
  netGst: 'Net GST',
  // capture
  takePhoto: '📷 Take photo',
  uploadLabel: 'Upload from library / files (images & PDF)',
  uploadDesktopHint: ' — or drag & drop / ⌘V',
  driveHint: 'Google Drive & cloud files: choose “Browse” in the sheet (Drive app required)',
  merchant: 'Merchant',
  totalInclGst: 'Total (incl. GST)',
  noteOptional: 'Note (optional)',
  note: 'Note',
  itemsPlaceholder: 'Items (one per line, optional)',
  noGst: 'No GST',
  gstAuto: 'GST auto',
  date: 'Date',
  today: 'Today',
  aiExtract: '✨ AI fill',
  aiExtracting: 'Reading receipt…',
  aiErrAuth: 'AI key invalid — check Settings',
  aiErrRate: 'AI rate limit hit — try again in a minute',
  aiErrNetwork: 'Network error — check connection and retry',
  aiErrOther: 'AI extraction failed — fill manually',
  discardDraft: 'Discard draft',
  remove: 'Remove',
  aiTitle: 'AI extraction',
  aiKeyPlaceholder: 'Gemini API key (free)',
  aiHint:
    'Get a free key at aistudio.google.com/apikey. Photos are sent to Google for extraction only when you tap the button.',
  saveKey: 'Save',
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
  clearPat: 'Clear credentials & lock',
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
  // lock & banner（锁屏文案刻意不提及 GitHub/PAT/仓库，避免向陌生访客泄露机制）
  password: 'Password',
  unlock: 'Unlock',
  authBanner: 'GitHub token rejected — update your PAT in Settings.',
  dismiss: 'Dismiss',
  updateReady: 'New version ready — tap here to update',
} as const;

export type MsgKey = keyof typeof en;

// Record<MsgKey, string> 让 TS 编译期强制中英文 key 完全对齐：漏译/多译都编译失败
const zh: Record<MsgKey, string> = {
  tabCapture: '拍照',
  tabReceipts: '票据',
  tabStats: '统计',
  tabExport: '导出',
  tabSettings: '设置',
  more: '更多',
  vsLastMonth: '较上月',
  last6Months: '近 6 个月',
  thisYear: '今年',
  allTime: '全部',
  balance: '结余',
  avgMonthly: '月均支出',
  trend: '趋势',
  topCategories: '分类排行',
  topMerchants: '商家排行',
  gstPeriod: 'GST · 近两月',
  noData: '还没有数据——先去录几张票据',
  company: '公司',
  personal: '个人',
  all: '全部',
  income: '收入',
  expense: '支出',
  gstPaid: 'GST 进项',
  gstCollected: 'GST 销项',
  netGst: 'GST 净额',
  takePhoto: '📷 拍照录入',
  uploadLabel: '从相册 / 文件上传（图片和 PDF）',
  uploadDesktopHint: '——也可拖拽 / ⌘V 粘贴',
  driveHint: 'Google Drive 等云盘：在弹出菜单选「浏览」（需已安装对应 App）',
  merchant: '商家',
  totalInclGst: '总额（含 GST）',
  noteOptional: '备注（可选）',
  note: '备注',
  itemsPlaceholder: '商品明细（每行一项，可选）',
  noGst: '无 GST',
  gstAuto: 'GST 自动',
  date: '日期',
  today: '今天',
  aiExtract: '✨ AI 识别填表',
  aiExtracting: '正在识别票据…',
  aiErrAuth: 'AI key 无效——请到设置检查',
  aiErrRate: 'AI 免费额度限流——稍等一分钟再试',
  aiErrNetwork: '网络出错——检查网络后重试',
  aiErrOther: 'AI 识别失败——请手动填写',
  discardDraft: '丢弃草稿',
  remove: '移除',
  aiTitle: 'AI 识别',
  aiKeyPlaceholder: 'Gemini API key（免费）',
  aiHint:
    '在 aistudio.google.com/apikey 免费生成。只有点击识别按钮时，照片才会发送给 Google 用于提取。',
  saveKey: '保存',
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
  clearPat: '清除凭证并锁定',
  preferences: '偏好',
  language: '语言',
  theme: '主题',
  dark: '深色',
  light: '浅色',
  status_idle: '已同步',
  status_syncing: '同步中',
  status_offline: '离线',
  status_error: '错误',
  password: '密码',
  unlock: '解锁',
  authBanner: 'GitHub token 被拒绝——请到设置中更新 PAT。',
  dismiss: '关闭',
  updateReady: '新版本已就绪，点这里更新',
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

// html lang 决定原生控件（日期选择器等）的语言
function applyLang(l: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en-NZ';
  }
}
applyLang(locale);

export function setLocale(l: Locale): void {
  locale = l;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
  applyLang(l);
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
