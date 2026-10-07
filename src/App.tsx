import { useEffect, useRef, useState } from 'react';
import { getPat } from './lib/settings';
import type { Space } from './data/types';
import { onAuthError, syncNow } from './sync/useSync';
import { useLocale, useT } from './lib/i18n';
import { LockScreen } from './ui/LockScreen';
import { CaptureScreen } from './ui/CaptureScreen';
import { ReceiptsScreen } from './ui/ReceiptsScreen';
import { DashboardScreen } from './ui/DashboardScreen';
import { ExportScreen } from './ui/ExportScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SpaceToggle } from './ui/components/SpaceToggle';
import { TopNav, type Tab } from './ui/components/TopNav';
import { SyncDot } from './ui/components/SyncDot';
import { TaxScreen } from './ui/TaxScreen';
import { taskTitle, useTaxAgenda, whenText } from './ui/taxAgenda';
import { CalendarClock, Check, RefreshCw, X } from 'lucide-react';
import { addDays } from './lib/taxCalendar';
import { consumeJustUpdated, versionLabel } from './lib/appVersion';
import { useAppUpdate } from './ui/useAppUpdate';

// 每次页面加载只算一次（放模块级：StrictMode 会把 useState 初始化跑两遍）
const JUST_UPDATED = consumeJustUpdated();

// 当前 Tab 和空间存 sessionStorage：更新刷新后回到原来的页面，而不是跳回拍照页
const UI_KEY = 'rh.ui';
function loadUi(): { tab: Tab; space: Space } {
  try {
    const v = JSON.parse(sessionStorage.getItem(UI_KEY) ?? '{}') as Partial<{
      tab: Tab;
      space: Space;
    }>;
    return { tab: v.tab ?? 'capture', space: v.space ?? 'company' };
  } catch {
    return { tab: 'capture', space: 'company' };
  }
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => !!getPat());
  const [tab, setTab] = useState<Tab>(() => loadUi().tab);
  const [space, setSpace] = useState<Space>(() => loadUi().space);
  const [showUpdated, setShowUpdated] = useState(JUST_UPDATED);
  const [authBanner, setAuthBanner] = useState(false);
  const [taxBannerDismissed, setTaxBannerDismissed] = useState(false);
  const t = useT();
  const locale = useLocale();
  const tax = useTaxAgenda();
  // 最紧急的一件：逾期或 7 天内到期才在每页顶部提醒（14 天内只亮角标，不打扰）
  const taxDue = tax.urgent.find((x) => x.due <= addDays(tax.today, 7)) ?? null;

  const update = useAppUpdate();

  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify({ tab, space }));
    } catch {
      /* 存不了就算了：只影响刷新后停在哪个 Tab */
    }
  }, [tab, space]);

  useEffect(() => {
    if (!showUpdated) return;
    const id = setTimeout(() => setShowUpdated(false), 4000);
    return () => clearTimeout(id);
  }, [showUpdated]);

  function tapUpdate() {
    // 有正在录入的内容时先确认：草稿只在内存里，刷新会丢
    if (!update.safeToReload() && !window.confirm(t('updateDiscardConfirm'))) return;
    update.apply();
  }

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

  // 更新相关的浮层：就绪横幅（点一下更新）、更新中遮罩（淡入盖住刷新瞬间）、更新完成提示
  const updateLayer = (
    <>
      {update.needRefresh && !update.applying && (
        <div className="drop-in pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] z-50 flex justify-center">
          <button
            onClick={tapUpdate}
            className="update-pulse pointer-events-auto rounded-full px-5 py-2.5 text-sm font-bold"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              boxShadow: '0 6px 20px color-mix(in srgb, var(--color-accent) 45%, transparent)',
            }}
          >
            {t('updateReady')}
          </button>
        </div>
      )}
      {update.applying && (
        <div
          className="fade-in fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3"
          style={{ background: 'var(--color-bg)' }}
          role="status"
        >
          <RefreshCw
            className="ptr-spin h-6 w-6"
            style={{ color: 'var(--color-accent)' }}
            aria-hidden="true"
          />
          <span className="text-sm muted">{t('updating')}</span>
        </div>
      )}
      {showUpdated && (
        <div className="drop-in pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] z-50 flex justify-center">
          <span
            className="panel flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
            role="status"
          >
            <Check className="icon" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            {t('updatedTo').replace('{v}', versionLabel())}
          </span>
        </div>
      )}
    </>
  );

  if (!unlocked)
    return (
      <>
        {updateLayer}
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
      {updateLayer}
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
      {taxDue && !taxBannerDismissed && tab !== 'tax' && (
        <div
          className="drop-in panel mx-4 mb-2 flex items-center gap-2 px-3 py-1.5 text-xs sm:mx-6"
          style={{ borderColor: 'var(--color-warning)' }}
        >
          <CalendarClock
            className="icon shrink-0"
            style={{ color: 'var(--color-warning)' }}
            aria-hidden="true"
          />
          <button onClick={() => setTab('tax')} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold">{taskTitle(taxDue, locale, t)}</span>
            <span className="block" style={{ color: 'var(--color-warning)' }}>
              {whenText(taxDue.due, tax.today, t)} · {t('view')}
            </span>
          </button>
          <button
            onClick={() => setTaxBannerDismissed(true)}
            aria-label={t('dismiss')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <X className="icon" aria-hidden="true" />
          </button>
        </div>
      )}
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
          {tab === 'tax' && <TaxScreen />}
          {tab === 'export' && <ExportScreen space={space} />}
          {tab === 'settings' && (
            <SettingsScreen
              onPatCleared={() => setUnlocked(false)}
              update={{ needRefresh: update.needRefresh, apply: tapUpdate, check: update.check }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
