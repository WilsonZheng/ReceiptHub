import type { Locale } from './i18n';
import type { CategoryLabels } from '../data/types';

// 分类的存储值恒为英文规范名（数据稳定、CSV 对会计友好），中文只在显示层翻译。
// 表里收的是默认分类 + 记账常用分类；不在表内的自建分类 → 用用户在设置里填的双语译名，否则原样显示。
const ZH: Record<string, string> = {
  // 公司支出（默认）
  'Office Supplies': '办公用品',
  'Software & SaaS': '软件订阅',
  Fuel: '油费',
  Parking: '停车',
  'Meals & Entertainment': '餐饮招待',
  Travel: '差旅',
  Equipment: '设备',
  Other: '其他',
  // 收入（默认）
  Sales: '销售',
  Services: '服务',
  Interest: '利息',
  Salary: '工资',
  Refunds: '退款',
  // 个人支出（默认）
  Groceries: '买菜日用',
  Dining: '外食',
  Transport: '交通',
  Utilities: '水电网',
  Health: '健康',
  // 记账常用（会计表格、AI 提名里常见）
  Tools: '工具',
  Repairs: '维修',
  Insurance: '保险',
  'Phone & Internet': '电话网络',
  'Vehicle Maintenance': '车辆维护',
  Appliances: '电器',
  'Home Goods': '家居用品',
  Furniture: '家具',
  Rent: '房租',
  Rates: '地税',
  'Bank Fees': '银行手续费',
  'Accounting Fees': '会计费',
  'Legal Fees': '律师费',
  Advertising: '广告推广',
  Subscriptions: '订阅',
  Training: '培训',
  'Postage & Courier': '快递邮寄',
  Clothing: '服装',
  Education: '教育',
  Entertainment: '娱乐',
  Gifts: '礼物',
  Donations: '捐款',
  Pets: '宠物',
  Dividends: '股息',
  Grants: '补贴',
};

// 中文或旧叫法 → 规范英文名。ZH 的中文值自动算别名，这里只放额外的同义词
const EXTRA_ALIASES: Record<string, string> = {
  车维护: 'Vehicle Maintenance',
  汽车维护: 'Vehicle Maintenance',
  车辆保养: 'Vehicle Maintenance',
  修车: 'Vehicle Maintenance',
  车险: 'Insurance',
  电话费: 'Phone & Internet',
  话费: 'Phone & Internet',
  网费: 'Phone & Internet',
  家居: 'Home Goods',
  软件: 'Software & SaaS',
  餐饮: 'Meals & Entertainment',
  加油: 'Fuel',
  Mobile: 'Phone & Internet',
  Phone: 'Phone & Internet',
  Software: 'Software & SaaS',
  Supplies: 'Office Supplies',
  'Car Maintenance': 'Vehicle Maintenance',
};

const ALIASES = new Map<string, string>();
for (const [en, zh] of Object.entries(ZH)) {
  ALIASES.set(en.toLowerCase(), en);
  ALIASES.set(zh, en);
}
for (const [alias, en] of Object.entries(EXTRA_ALIASES)) ALIASES.set(alias.toLowerCase(), en);

/** 输入/旧数据里的分类名 → 规范名：已知分类（中文名、大小写变体、同义词）归到英文 key，其余原样（去空格） */
export function canonicalCategoryName(name: string): string {
  const trimmed = name.trim();
  return ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

/** 表里认识的分类（含中文别名）：天然中英双语，不需要用户补译名 */
export function isKnownCategory(name: string): boolean {
  return canonicalCategoryName(name) in ZH;
}

// 字典里所有自带中英文的分类名：AI 提名新分类时优先从这里挑，挑中的自动有中文
export const knownCategoryNames = (): string[] => Object.keys(ZH);

/**
 * 分类的显示名。优先级：用户在设置里填的 locale 译名 → 内置中英字典 → 原样 key。
 * canonical key（存储值）始终不变，本函数只决定怎么"显示"；中文 key 的旧数据也按字典显示。
 */
export function categoryLabel(name: string, locale: Locale, labels?: CategoryLabels): string {
  const key = canonicalCategoryName(name);
  const override = (labels?.[name]?.[locale] ?? labels?.[key]?.[locale])?.trim();
  if (override) return override;
  if (!(key in ZH)) return name;
  return locale === 'zh' ? ZH[key] : key;
}
