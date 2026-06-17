import type { Locale } from './i18n';
import type { CategoryLabels } from '../data/types';

// 分类的存储值恒为英文规范名（数据稳定、CSV 对会计友好），中文只在显示层翻译。
// 用户自建分类不在表内 → 优先用用户在设置里填的双语译名，否则原样显示。
const ZH: Record<string, string> = {
  'Office Supplies': '办公用品',
  'Software & SaaS': '软件订阅',
  Fuel: '油费',
  Parking: '停车',
  'Meals & Entertainment': '餐饮招待',
  Travel: '差旅',
  Equipment: '设备',
  Other: '其他',
  Sales: '销售',
  Services: '服务',
  Interest: '利息',
  Groceries: '买菜日用',
  Dining: '外食',
  Transport: '交通',
  Utilities: '水电网',
  Health: '健康',
  Salary: '工资',
  Refunds: '退款',
};

/** 内置分类（其规范名是 ZH 字典的 key，天然中英双语）；自定义分类不在此列，需用户补译名 */
export function isBuiltinCategory(name: string): boolean {
  return name in ZH;
}

/**
 * 分类的显示名。优先级：用户在设置里填的 locale 译名 → 内置中文字典（zh）→ 原样 key。
 * canonical key（存储值）始终不变，本函数只决定怎么"显示"。
 */
export function categoryLabel(name: string, locale: Locale, labels?: CategoryLabels): string {
  const override = labels?.[name]?.[locale]?.trim();
  if (override) return override;
  return locale === 'zh' ? (ZH[name] ?? name) : name;
}
