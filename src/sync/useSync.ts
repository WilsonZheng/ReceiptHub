import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { adoptUsedCategories, getPat, DATA_REPO } from '../lib/settings';
import { AuthError, GithubClient } from './github';
import { flushOutbox, pullAll } from './engine';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

let authErrorHandler: (() => void) | null = null;
export const onAuthError = (fn: () => void): void => {
  authErrorHandler = fn;
};

const state = { status: 'idle' as SyncStatus, listeners: new Set<() => void>() };
const setStatus = (s: SyncStatus): void => {
  state.status = s;
  state.listeners.forEach((l) => l());
};

let inFlight = false;
// 同步进行中又有新改动：这一轮结束后马上再跑一轮，不用等下一分钟
let again = false;
export const isSyncing = () => inFlight;

export async function syncNow(): Promise<void> {
  const pat = getPat();
  if (!pat) return;
  if (inFlight) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus('offline');
    return;
  }
  inFlight = true;
  setStatus('syncing');
  try {
    const client = new GithubClient(pat, DATA_REPO);
    // 推送失败也照样拉取：LWW 合并会保留本地较新的版本，别的设备的改动不该被一条坏操作挡住
    let pushError: unknown = null;
    try {
      await flushOutbox(client);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      pushError = e;
    }
    await pullAll(client);
    // 别的设备加的/导入的分类补进本机列表，编辑时才选得到
    adoptUsedCategories(await db.receipts.toArray());
    if (pushError) throw pushError;
    setStatus('idle');
  } catch (e) {
    setStatus('error');
    if (e instanceof AuthError) authErrorHandler?.();
  } finally {
    inFlight = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

// 存完一张票就推送：以前只靠每分钟一次的定时器，存完一分钟内锁屏的话
// iOS 会把页面挂起，要等下次打开 App 才上传（实际记录里拍完 5–6 小时才同步）
let soon: ReturnType<typeof setTimeout> | undefined;
function syncSoon() {
  clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), 500);
}

export function useSyncStatus(): { status: SyncStatus; pending: number } {
  const [status, setLocal] = useState(state.status);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const listener = () => setLocal(state.status);
    state.listeners.add(listener);
    let last = 0;
    const sub = liveQuery(() => db.outbox.count()).subscribe({
      next: (n) => {
        setPending(n);
        if (n > last) syncSoon(); // 新排进来的改动
        last = n;
      },
    });
    const onlineHandler = () => void syncNow();
    window.addEventListener('online', onlineHandler);
    // 切回 App 时拉一次最新的；切到后台时还有没推完的就趁 iOS 挂起前再推一次
    const onVisibility = () => {
      if (document.visibilityState === 'visible' || last > 0) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => void syncNow(), 60_000);
    void syncNow();
    return () => {
      state.listeners.delete(listener);
      sub.unsubscribe();
      window.removeEventListener('online', onlineHandler);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);
  return { status, pending };
}
