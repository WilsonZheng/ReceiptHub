import { DEFAULT_CONFIG, type AppConfig, type Space } from '../data/types';

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
