import { describe, expect, it } from 'vitest';
import { categoryLabel } from './categories';

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
});
