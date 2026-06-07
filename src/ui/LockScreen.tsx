import { useState } from 'react';
import { hasVault, openVault, sealPat, takeLegacyPat } from '../lib/vault';
import { useT } from '../lib/i18n';

// 模块加载时做一次旧版明文 PAT 迁移（放组件外避免 StrictMode 双调用）
const legacyPat = takeLegacyPat();

type Mode = 'unlock' | 'setup';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<Mode>(hasVault() ? 'unlock' : 'setup');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(legacyPat ?? '');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useT();

  async function handleUnlock() {
    setBusy(true);
    setError(false);
    const pat = await openVault(password);
    setBusy(false);
    if (pat) onUnlock();
    else setError(true);
  }

  async function handleSetup() {
    if (!token.trim() || !password.trim()) return;
    setBusy(true);
    await sealPat(token, password);
    setBusy(false);
    onUnlock();
  }

  // 锁屏刻意不提及任何认证机制——只是一个密码框
  return (
    <div
      className="mx-auto flex h-dvh max-w-sm flex-col items-center justify-center gap-4 px-8"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <h1 className="text-2xl font-bold">ReceiptHub</h1>

      {mode === 'unlock' ? (
        <>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleUnlock()}
            placeholder={t('password')}
            autoFocus
            className="field"
          />
          {error && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {t('wrongPassword')}
            </p>
          )}
          <button
            disabled={!password.trim() || busy}
            onClick={() => void handleUnlock()}
            className="w-full rounded-lg py-2 font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
          >
            {t('unlock')}
          </button>
          <button
            onClick={() => setMode('setup')}
            className="text-xs underline"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {t('firstTimeDevice')}
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('token')}
            className="field"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSetup()}
            placeholder={t('setPassword')}
            className="field"
          />
          <button
            disabled={!token.trim() || !password.trim() || busy}
            onClick={() => void handleSetup()}
            className="w-full rounded-lg py-2 font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
          >
            {t('save')}
          </button>
          {hasVault() && (
            <button
              onClick={() => setMode('unlock')}
              className="text-xs underline"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              {t('backToUnlock')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
