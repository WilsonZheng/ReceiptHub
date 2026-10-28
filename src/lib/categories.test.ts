import { describe, expect, it } from 'vitest';
import { canonicalCategoryName, categoryLabel, isKnownCategory } from './categories';

describe('categoryLabel', () => {
  it('translates built-in categories for zh', () => {
    expect(categoryLabel('Fuel', 'zh')).toBe('油费');
    expect(categoryLabel('Meals & Entertainment', 'zh')).toBe('餐饮招待');
    expect(categoryLabel('Salary', 'zh')).toBe('工资');
  });
  it('falls back to raw name for user-defined categories', () => {
    expect(categoryLabel('Dog Treats', 'zh')).toBe('Dog Treats');
  });
  it('passes through in en', () => {
    expect(categoryLabel('Fuel', 'en')).toBe('Fuel');
  });

  // 自定义分类的双语显示：canonical key 不变，只在显示层按 locale 覆盖
  it('uses a user label override for a custom category in the other language', () => {
    // 中文录入的自定义分类（key=保险），英文界面显示用户填的 English 名
    const labels = { 保险: { en: 'Insurance' } };
    expect(categoryLabel('保险', 'en', labels)).toBe('Insurance');
    // 中文界面仍按原 key 显示（key 本身就是中文）
    expect(categoryLabel('保险', 'zh', labels)).toBe('保险');
  });
  it('uses a zh override for an english-keyed custom category', () => {
    const labels = { Insurance: { zh: '保险' } };
    expect(categoryLabel('Insurance', 'zh', labels)).toBe('保险');
    expect(categoryLabel('Insurance', 'en', labels)).toBe('Insurance');
  });
  it('built-in translation wins; an empty/absent override never breaks defaults', () => {
    expect(categoryLabel('Fuel', 'zh', { Fuel: { zh: '' } })).toBe('油费');
    expect(categoryLabel('Fuel', 'zh', undefined)).toBe('油费');
  });

  it('isKnownCategory covers built-ins and common accounting categories, not arbitrary names', () => {
    expect(isKnownCategory('Fuel')).toBe(true);
    expect(isKnownCategory('Salary')).toBe(true);
    expect(isKnownCategory('Insurance')).toBe(true);
    expect(isKnownCategory('保险')).toBe(true); // 中文别名也算已知
    expect(isKnownCategory('Dog Treats')).toBe(false);
  });
});

describe('common categories are bilingual', () => {
  it.each([
    ['Insurance', '保险'],
    ['Tools', '工具'],
    ['Repairs', '维修'],
    ['Phone & Internet', '电话网络'],
    ['Vehicle Maintenance', '车辆维护'],
    ['Appliances', '电器'],
    ['Home Goods', '家居用品'],
    ['Rent', '房租'],
    ['Bank Fees', '银行手续费'],
    ['Accounting Fees', '会计费'],
  ])('%s shows as %s in zh', (en, zh) => {
    expect(categoryLabel(en, 'zh')).toBe(zh);
    expect(categoryLabel(en, 'en')).toBe(en);
  });
});

describe('canonicalCategoryName', () => {
  it('maps Chinese and case variants of known categories to the English key', () => {
    expect(canonicalCategoryName('保险')).toBe('Insurance');
    expect(canonicalCategoryName('车维护')).toBe('Vehicle Maintenance');
    expect(canonicalCategoryName('汽车维护')).toBe('Vehicle Maintenance');
    expect(canonicalCategoryName(' 电器 ')).toBe('Appliances');
    expect(canonicalCategoryName('fuel')).toBe('Fuel');
    expect(canonicalCategoryName('油费')).toBe('Fuel');
  });
  it('leaves unknown names as typed (trimmed)', () => {
    expect(canonicalCategoryName('  宠物用品 ')).toBe('宠物用品');
    expect(canonicalCategoryName('Dog Treats')).toBe('Dog Treats');
  });
  it('labels legacy Chinese-keyed records in both languages', () => {
    expect(categoryLabel('车维护', 'en')).toBe('Vehicle Maintenance');
    expect(categoryLabel('车维护', 'zh')).toBe('车辆维护');
    expect(categoryLabel('工具', 'en')).toBe('Tools');
  });
  it('a user override still wins over the dictionary', () => {
    expect(categoryLabel('Insurance', 'zh', { Insurance: { zh: '车险' } })).toBe('车险');
  });
});
