import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'rh.theme';
// iOS 状态栏/浏览器框架颜色跟随主题
const META_COLORS: Record<Theme, string> = { dark: '#050505', light: '#f2f2f7' };

function detect(): Theme {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }
  return 'dark';
}

let theme: Theme = detect();
const listeners = new Set<() => void>();

function apply(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[t]);
}

/** main.tsx 启动时调用，首帧前就挂上主题属性 */
export function initTheme(): void {
  apply(theme);
}

export function setTheme(t: Theme): void {
  theme = t;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, t);
  apply(t);
  listeners.forEach((fn) => fn());
}

export const getTheme = (): Theme => theme;

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme);
}
