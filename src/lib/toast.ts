import { useSyncExternalStore } from 'react';

// 一句话的操作反馈（"已保存 · Bunnings $184.50"）：顶部短暂出现，自己消失。
// 放顶部是因为 iOS 主屏幕模式下屏幕底边不可信（见 CLAUDE.md）。
let current: { id: number; text: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, ms = 2600): void {
  clearTimeout(timer);
  current = { id: (current?.id ?? 0) + 1, text };
  emit();
  timer = setTimeout(() => {
    current = null;
    emit();
  }, ms);
}

export function useToast(): { id: number; text: string } | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
