import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getDraft, isDraftDirty } from '../lib/draft';
import { isBusy } from '../lib/busy';

export type CheckResult = 'latest' | 'available' | 'unsupported' | 'error';

// 没有未保存内容（拍照草稿、详情编辑）才能无感刷新——草稿只在内存里，刷新就没了
const safeToReload = () => !isDraftDirty(getDraft()) && !isBusy();

/**
 * 版本更新：仍是 prompt 模式（不在用户填表时突然刷新），但尽量不用用户操心：
 * - 冷启动 5 秒内发现新版且没有未保存内容 → 淡出后直接套用
 * - 切到后台时套用 → 回来就是新版（当前 Tab 由 sessionStorage 恢复）
 * - 其余时候显示横幅，点一下淡出刷新
 */
export function useAppUpdate() {
  const startedAt = useRef(Date.now());
  const [applying, setApplying] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // 长会话每小时后台查一次
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  function apply() {
    setApplying(true);
    // 先让遮罩淡入盖住页面，再换版本；新 SW 接管后插件会自动刷新，6 秒没动静就手动刷新兜底
    setTimeout(() => {
      void updateServiceWorker(true);
      setTimeout(() => window.location.reload(), 6000);
    }, 240);
  }

  useEffect(() => {
    if (!needRefresh) return;
    if (Date.now() - startedAt.current < 5000 && safeToReload()) {
      apply();
      return;
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden' && safeToReload()) void updateServiceWorker(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [needRefresh]);

  /** 手动检查：触发一次 SW 更新检查，等新版本装好再报告结果 */
  async function check(): Promise<CheckResult> {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return 'unsupported';
    try {
      await reg.update();
    } catch {
      return 'error';
    }
    const installing = reg.installing;
    if (installing)
      await new Promise<void>((resolve) => {
        const settle = () => {
          if (installing.state !== 'installing') resolve();
        };
        installing.addEventListener('statechange', settle);
        settle();
      });
    return reg.waiting ? 'available' : 'latest';
  }

  return { needRefresh, applying, apply, check, safeToReload };
}
