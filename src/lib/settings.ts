import {
  DEFAULT_CONFIG,
  type AppConfig,
  type CategoryLabels,
  type Kind,
  type Receipt,
  type Space,
} from '../data/types';
import { canonicalCategoryName } from './categories';
import type { Locale } from './i18n';
import type { GstFrequency } from './periods';

const PAT_KEY = 'rh.pat';
const CONFIG_KEY = 'rh.config';
const ADOPTED_KEY = 'rh.cat.adopted'; // 已从记录里收过的分类：用户删掉后不再自动加回
const AI_PROVIDER_KEY = 'rh.ai.provider';
const AI_KEYS = {
  mistral: 'rh.mistral',
  gemini: 'rh.gemini', // 保留旧 key 名，现有 Gemini 用户无需迁移
} as const;
export const DATA_REPO = 'WilsonZheng/ReceiptHub-data';

export type AiProvider = keyof typeof AI_KEYS;

/** 新用户优先 Mistral；已有 Gemini key 的用户继续沿用 Gemini。 */
export function getAiProvider(): AiProvider {
  const saved = localStorage.getItem(AI_PROVIDER_KEY);
  if (saved === 'mistral' || saved === 'gemini') return saved;
  return localStorage.getItem(AI_KEYS.gemini) ? 'gemini' : 'mistral';
}

export function setAiProvider(provider: AiProvider): void {
  localStorage.setItem(AI_PROVIDER_KEY, provider);
}

// API key 是可选功能，每个提供商独立保存；不配当前提供商则 AI 提取按钮不出现。
export const getAiKey = (provider: AiProvider = getAiProvider()): string | null =>
  localStorage.getItem(AI_KEYS[provider]);
export const setAiKey = (provider: AiProvider, key: string): void => {
  const v = key.trim();
  if (v) localStorage.setItem(AI_KEYS[provider], v);
  else localStorage.removeItem(AI_KEYS[provider]);
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
    return normalizeCategories(migrated);
  }
  return normalizeCategories(parsed as AppConfig);
}

/** 已存配置里的中文/同义词分类名归到英文规范名（去重，译名跟着搬），有变化才写回 */
function normalizeCategories(cfg: AppConfig): AppConfig {
  let changed = false;
  const fix = (list: string[]) => {
    const out: string[] = [];
    for (const c of list) {
      const k = canonicalCategoryName(c);
      if (k !== c) changed = true;
      if (!out.includes(k)) out.push(k);
      else changed = true;
    }
    return out;
  };
  const categories = {
    company: {
      expense: fix(cfg.categories.company.expense),
      income: fix(cfg.categories.company.income),
    },
    personal: {
      expense: fix(cfg.categories.personal.expense),
      income: fix(cfg.categories.personal.income),
    },
  };
  let labels = cfg.labels;
  if (labels) {
    const moved: CategoryLabels = {};
    for (const [name, entry] of Object.entries(labels)) {
      const k = canonicalCategoryName(name);
      if (k !== name) changed = true;
      moved[k] = { ...entry, ...moved[k] };
    }
    labels = moved;
  }
  if (!changed) return cfg;
  const next: AppConfig = labels ? { categories, labels } : { categories };
  setConfig(next);
  return next;
}

/**
 * 记录里用到、但分类列表里没有的分类（别的设备加的、导入的）补进列表，编辑时才能选中。
 * 每个分类只收一次：用户之后自己删掉的，不会因为同步又冒出来。
 */
export function adoptUsedCategories(receipts: Receipt[]): void {
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(ADOPTED_KEY) ?? '[]') as string[];
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  let cfg = getConfig();
  for (const r of receipts) {
    if (r.deleted || !r.category) continue;
    const kind: Kind = r.kind ?? 'expense';
    const name = canonicalCategoryName(r.category);
    const key = `${r.space}|${kind}|${name}`;
    if (seenSet.has(key)) continue;
    seenSet.add(key);
    if (!cfg.categories[r.space][kind].includes(name))
      cfg = addCategoryToConfig(r.space, kind, name);
  }
  if (seenSet.size !== seen.length) localStorage.setItem(ADOPTED_KEY, JSON.stringify([...seenSet]));
}
export function setConfig(c: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

/** 向指定空间/收支类型追加分类（大小写不敏感去重），返回最新配置 */
export function addCategoryToConfig(space: Space, kind: Kind, name: string): AppConfig {
  const cfg = getConfig();
  const list = cfg.categories[space][kind];
  const trimmed = canonicalCategoryName(name);
  if (!trimmed || list.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return cfg;
  const next: AppConfig = {
    ...cfg,
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
  const wanted = canonicalCategoryName(name);
  return (
    cfg.categories[space][kind].find((c) => c.toLowerCase() === wanted.toLowerCase()) ?? wanted
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

// GST 申报频率决定统计/导出/税务待办里"GST 期"的边界。默认每半年（3、9 月结束）：
// 销售额低于 $500,000 的小公司可选，是本 App 目标用户最常见的情况；不对就在税务页改
const GST_FREQ_KEY = 'rh.gst.freq';
const GST_FREQS: readonly GstFrequency[] = ['monthly', 'two-odd', 'two-even', 'six'];
export function getGstFrequency(): GstFrequency {
  const saved = localStorage.getItem(GST_FREQ_KEY) as GstFrequency | null;
  return saved && GST_FREQS.includes(saved) ? saved : 'six';
}
export function setGstFrequency(f: GstFrequency): void {
  localStorage.setItem(GST_FREQ_KEY, f);
}
