import { describe, expect, it } from 'vitest';
import { categoryLabel, isBuiltinCategory } from './categories';

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

  it('isBuiltinCategory distinguishes built-ins from custom names', () => {
    expect(isBuiltinCategory('Fuel')).toBe(true);
    expect(isBuiltinCategory('Salary')).toBe(true);
    expect(isBuiltinCategory('保险')).toBe(false);
    expect(isBuiltinCategory('Insurance')).toBe(false);
  });
});
