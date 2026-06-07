import type { Locale } from './i18n';

// 分类的存储值恒为英文规范名（数据稳定、CSV 对会计友好），中文只在显示层翻译。
// 用户自建分类不在表内 → 原样显示。
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

export function categoryLabel(name: string, locale: Locale): string {
  return locale === 'zh' ? (ZH[name] ?? name) : name;
}
