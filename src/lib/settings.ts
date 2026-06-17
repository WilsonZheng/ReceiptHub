import {
  DEFAULT_CONFIG,
  type AppConfig,
  type CategoryLabels,
  type Kind,
  type Space,
} from '../data/types';
import type { Locale } from './i18n';

const PAT_KEY = 'rh.pat';
const CONFIG_KEY = 'rh.config';
const AI_KEY = 'rh.gemini';
export const DATA_REPO = 'WilsonZheng/ReceiptHub-data';

// Gemini API key（免费层）——可选功能，不配则 AI 提取按钮不出现
export const getAiKey = (): string | null => localStorage.getItem(AI_KEY);
export const setAiKey = (key: string): void => {
  const v = key.trim();
  if (v) localStorage.setItem(AI_KEY, v);
  else localStorage.removeItem(AI_KEY);
};

// UI 上对外只称 "Password"，实际值是 fine-grained PAT——锁屏不泄露认证机制
export const getPat = (): string | null => localStorage.getItem(PAT_KEY);
export const setPat = (pat: string): void => localStorage.setItem(PAT_KEY, pat.trim());
export const clearPat = (): void => localStorage.removeItem(PAT_KEY);

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return DEFAULT_CONFIG;
  const parsed = JSON.parse(raw) as AppConfig | { categories: Record<Space, string[]> };
  // 旧版每空间单列表 → 迁移为 支出沿用旧列表 + 收入用默认列表
  if (Array.isArray(parsed.categories.company)) {
    const legacy = parsed as { categories: Record<Space, string[]> };
    const migrated: AppConfig = {
      categories: {
        company: {
          expense: legacy.categories.company,
          income: DEFAULT_CONFIG.categories.company.income,
        },
        personal: {
          expense: legacy.categories.personal,
          income: DEFAULT_CONFIG.categories.personal.income,
        },
      },
    };
    setConfig(migrated);
    return migrated;
  }
  return parsed as AppConfig;
}
export function setConfig(c: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

/** 向指定空间/收支类型追加分类（大小写不敏感去重），返回最新配置 */
export function addCategoryToConfig(space: Space, kind: Kind, name: string): AppConfig {
  const cfg = getConfig();
  const list = cfg.categories[space][kind];
  const trimmed = name.trim();
  if (!trimmed || list.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return cfg;
  const next: AppConfig = {
    categories: {
      ...cfg.categories,
      [space]: { ...cfg.categories[space], [kind]: [...list, trimmed] },
    },
  };
  setConfig(next);
  return next;
}

/** 找到与 name 大小写等价的现有规范名（用于添加后选中） */
export function canonicalCategory(cfg: AppConfig, space: Space, kind: Kind, name: string): string {
  return (
    cfg.categories[space][kind].find((c) => c.toLowerCase() === name.trim().toLowerCase()) ??
    name.trim()
  );
}

/**
 * 设置自定义分类在某语言下的显示名（空字符串=清除该语言覆盖）。
 * canonical key 不动——只改显示层。返回最新配置。
 */
export function setCategoryLabel(name: string, locale: Locale, label: string): AppConfig {
  const cfg = getConfig();
  const trimmed = label.trim();
  const labels: CategoryLabels = { ...(cfg.labels ?? {}) };
  const entry = { ...(labels[name] ?? {}) };
  if (trimmed) entry[locale] = trimmed;
  else delete entry[locale];
  if (Object.keys(entry).length) labels[name] = entry;
  else delete labels[name];
  const next: AppConfig = { ...cfg, labels };
  setConfig(next);
  return next;
}
