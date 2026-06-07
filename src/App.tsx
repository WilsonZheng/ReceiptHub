import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getPat } from './lib/settings';
import type { Space } from './data/types';
import { onAuthError } from './sync/useSync';
import { useT } from './lib/i18n';
import { LockScreen } from './ui/LockScreen';
import { CaptureScreen } from './ui/CaptureScreen';
import { ReceiptsScreen } from './ui/ReceiptsScreen';
import { ExportScreen } from './ui/ExportScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SpaceToggle } from './ui/components/SpaceToggle';
import { TabBar, type Tab } from './ui/components/TabBar';
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

  const updateBanner = needRefresh && (
    <button
      onClick={() => void updateServiceWorker(true)}
      className="w-full px-4 py-2 text-center text-xs font-semibold"
      style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
    >
      {t('updateReady')} → {t('refresh')}
    </button>
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
      className="h-app mx-auto flex max-w-lg flex-col"
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
          className="px-4 py-2 text-center text-xs font-semibold"
          style={{ background: 'var(--color-danger)', color: '#fff' }}
        >
          {t('authBanner')}{' '}
          <button className="underline" onClick={() => setAuthBanner(false)}>
            {t('dismiss')}
          </button>
        </div>
      )}
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold">ReceiptHub</h1>
        <div className="flex items-center gap-3">
          <SyncDot />
          <SpaceToggle space={space} onChange={setSpace} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-2">
        {tab === 'capture' && <CaptureScreen space={space} onSaved={() => setTab('receipts')} />}
        {tab === 'receipts' && <ReceiptsScreen space={space} />}
        {tab === 'export' && <ExportScreen space={space} />}
        {tab === 'settings' && <SettingsScreen onPatCleared={() => setUnlocked(false)} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
