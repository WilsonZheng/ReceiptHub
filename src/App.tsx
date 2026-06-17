import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getPat } from './lib/settings';
import type { Space } from './data/types';
import { onAuthError, syncNow } from './sync/useSync';
import { useT } from './lib/i18n';
import { LockScreen } from './ui/LockScreen';
import { CaptureScreen } from './ui/CaptureScreen';
import { ReceiptsScreen } from './ui/ReceiptsScreen';
import { DashboardScreen } from './ui/DashboardScreen';
import { ExportScreen } from './ui/ExportScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SpaceToggle } from './ui/components/SpaceToggle';
import { TopNav, type Tab } from './ui/components/TopNav';
import { SyncDot } from './ui/components/SyncDot';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => !!getPat());
  const [tab, setTab] = useState<Tab>('capture');
  const [space, setSpace] = useState<Space>('company');
  const [authBanner, setAuthBanner] = useState(false);
  const t = useT();

  // 新版本就绪时弹横幅，点击即切换；长会话每小时后台查一次更新
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    onAuthError(() => setAuthBanner(true));
  }, []);

  // ── 下拉刷新：iOS standalone 没有系统级 PTR，自实现 ──
  // 松手后触发数据同步 + service worker 版本检查（有新版会弹更新横幅）
  const mainRef = useRef<HTMLElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const PULL_TRIGGER = 55;

  function onTouchStart(e: React.TouchEvent) {
    startY.current = (mainRef.current?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && (mainRef.current?.scrollTop ?? 1) <= 0) {
      setPull(Math.min(90, dy * 0.5)); // 阻尼
    } else {
      setPull(0);
    }
  }
  async function onTouchEnd() {
    const triggered = pull >= PULL_TRIGGER;
    startY.current = null;
    if (!triggered || refreshing) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(PULL_TRIGGER);
    try {
      await syncNow();
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      // 同步失败已由 SyncDot/横幅呈现，这里静默
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  // 悬浮胶囊按钮：圆角+阴影+呼吸动画，明确"可点击"
  const updateBanner = needRefresh && (
    <div className="drop-in pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] z-50 flex justify-center">
      <button
        onClick={() => void updateServiceWorker(true)}
        className="update-pulse pointer-events-auto rounded-full px-5 py-2.5 text-sm font-bold"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-accent-ink)',
          // 跟随 accent token（旧值 rgba(61,220,151) 是改版前的死绿 #3ddc97，与当前 #00ff66 不符）
          boxShadow: '0 6px 20px color-mix(in srgb, var(--color-accent) 45%, transparent)',
        }}
      >
        ⟳ {t('updateReady')}
      </button>
    </div>
  );

  if (!unlocked)
    return (
      <>
        {updateBanner}
        <LockScreen onUnlock={() => setUnlocked(true)} />
      </>
    );

  return (
    <div
      className="app-shell mx-auto flex w-full max-w-5xl flex-col"
      style={{
        // 刘海/灵动岛安全区：PWA 全屏模式下 header 不被状态栏压住
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {updateBanner}
      {authBanner && (
        <div
          className="drop-in px-4 py-2 text-center text-xs font-semibold"
          style={{ background: 'var(--color-danger)', color: '#fff' }}
        >
          {t('authBanner')}{' '}
          <button className="underline" onClick={() => setAuthBanner(false)}>
            {t('dismiss')}
          </button>
        </div>
      )}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <h1 className="shrink-0 text-xl font-black italic tracking-tighter sm:text-2xl">
          ReceiptHub<span style={{ color: 'var(--color-accent)' }}>.</span>
        </h1>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <SyncDot />
          <SpaceToggle space={space} onChange={setSpace} />
        </div>
      </header>
      <TopNav tab={tab} onChange={setTab} />
      <main
        ref={mainRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => void onTouchEnd()}
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)] sm:px-6"
      >
        {/* 下拉刷新指示器：随下拉距离展开，触发后转圈 */}
        <div
          className="flex items-end justify-center overflow-hidden"
          style={{
            height: pull,
            transition: refreshing || pull === 0 ? 'height .25s cubic-bezier(.32,.72,0,1)' : 'none',
          }}
        >
          <span
            className={`pb-2 text-lg ${refreshing ? 'ptr-spin' : ''}`}
            style={{
              color: 'var(--color-accent)',
              opacity: Math.min(1, pull / PULL_TRIGGER),
              transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
              display: 'inline-block',
            }}
          >
            ↻
          </span>
        </div>
        {/* key 驱动 Tab 切换动画：每次换屏重新触发 screen-in */}
        <div key={tab} className="screen-in">
          {tab === 'capture' && <CaptureScreen space={space} onSaved={() => setTab('receipts')} />}
          {tab === 'receipts' && (
            <ReceiptsScreen space={space} onCapture={() => setTab('capture')} />
          )}
          {tab === 'stats' && <DashboardScreen space={space} onCapture={() => setTab('capture')} />}
          {tab === 'export' && <ExportScreen space={space} />}
          {tab === 'settings' && <SettingsScreen onPatCleared={() => setUnlocked(false)} />}
        </div>
      </main>
    </div>
  );
}
