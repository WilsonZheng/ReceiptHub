import { DEFAULT_CONFIG, type AppConfig } from '../data/types';

const PAT_KEY = 'rh.pat';
const CONFIG_KEY = 'rh.config';
export const DATA_REPO = 'WilsonZheng/ReceiptHub-data';

// UI 上对外只称 "Password"，实际值是 fine-grained PAT——锁屏不泄露认证机制
export const getPat = (): string | null => localStorage.getItem(PAT_KEY);
export const setPat = (pat: string): void => localStorage.setItem(PAT_KEY, pat.trim());
export const clearPat = (): void => localStorage.removeItem(PAT_KEY);

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as AppConfig) : DEFAULT_CONFIG;
}
export function setConfig(c: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}
