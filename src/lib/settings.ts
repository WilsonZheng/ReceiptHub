import { DEFAULT_CONFIG, type AppConfig } from '../data/types';
import { getSessionPat } from './vault';

const CONFIG_KEY = 'rh.config';
export const DATA_REPO = 'WilsonZheng/ReceiptHub-data';

/** 当前会话的 PAT（由 vault 解锁后注入 sessionStorage） */
export const getPat = (): string | null => getSessionPat();

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as AppConfig) : DEFAULT_CONFIG;
}
export function setConfig(c: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}
