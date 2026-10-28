import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, type Receipt } from '../data/types';
import { addCategoryToConfig, adoptUsedCategories, getConfig, setConfig } from './settings';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
beforeEach(() => mem.clear());

const rec = (space: Receipt['space'], category: string, kind: Receipt['kind'] = 'expense') =>
  ({ space, kind, category, deleted: false }) as Receipt;

describe('category config', () => {
  it('adding a Chinese name of a known category stores the English key once', () => {
    addCategoryToConfig('company', 'expense', '保险');
    addCategoryToConfig('company', 'expense', 'insurance');
    const list = getConfig().categories.company.expense;
    expect(list.filter((c) => c === 'Insurance')).toHaveLength(1);
    expect(list).not.toContain('保险');
  });

  it('adding a category keeps the display names the user already set', () => {
    setConfig({ ...structuredClone(DEFAULT_CONFIG), labels: { 'Dog Treats': { zh: '狗零食' } } });
    addCategoryToConfig('personal', 'expense', 'Dog Treats');
    addCategoryToConfig('personal', 'expense', 'Cat Food');
    expect(getConfig().labels).toEqual({ 'Dog Treats': { zh: '狗零食' } });
  });

  it('migrates Chinese-keyed custom categories in a saved config to English keys', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.categories.company.expense.push('车维护', 'Vehicle Maintenance');
    cfg.categories.personal.expense.push('电器');
    cfg.labels = { 车维护: { en: 'Car upkeep' } };
    setConfig(cfg);
    const got = getConfig();
    expect(got.categories.company.expense.filter((c) => c === 'Vehicle Maintenance')).toHaveLength(
      1,
    );
    expect(got.categories.company.expense).not.toContain('车维护');
    expect(got.categories.personal.expense).toContain('Appliances');
    expect(got.labels).toEqual({ 'Vehicle Maintenance': { en: 'Car upkeep' } });
  });

  it('adopts categories used by records once, and does not bring back ones the user removed', () => {
    adoptUsedCategories([
      rec('company', 'Tools'),
      rec('company', 'Tools'),
      rec('personal', '工具'),
    ]);
    expect(getConfig().categories.company.expense).toContain('Tools');
    expect(getConfig().categories.personal.expense).toContain('Tools');
    // 用户删掉 Tools 之后，再同步也不会自己回来
    const cfg = getConfig();
    cfg.categories.company.expense = cfg.categories.company.expense.filter((c) => c !== 'Tools');
    setConfig(cfg);
    adoptUsedCategories([rec('company', 'Tools')]);
    expect(getConfig().categories.company.expense).not.toContain('Tools');
  });

  it('ignores deleted records when adopting', () => {
    adoptUsedCategories([{ ...rec('company', 'Ghost'), deleted: true }]);
    expect(getConfig().categories.company.expense).not.toContain('Ghost');
  });
});
