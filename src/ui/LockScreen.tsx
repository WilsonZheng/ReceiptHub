import { useState } from 'react';
import { setPat } from '../lib/settings';
import { useT } from '../lib/i18n';

// 锁屏刻意极简：只有一个"密码"框，不提及 GitHub/PAT/仓库等任何机制信息
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const t = useT();

  function handleUnlock() {
    if (!value.trim()) return;
    setPat(value);
    onUnlock();
  }

  return (
    <div
      className="app-shell mx-auto flex max-w-sm flex-col items-center justify-center gap-4 px-8"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <h1 className="text-3xl font-black italic tracking-tighter">
        ReceiptHub<span style={{ color: 'var(--color-accent)' }}>.</span>
      </h1>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
        placeholder={t('password')}
        autoFocus
        className="field"
      />
      <button
        disabled={!value.trim()}
        onClick={handleUnlock}
        className="btn-glow w-full rounded-lg py-2 font-semibold disabled:opacity-40 disabled:shadow-none"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('unlock')}
      </button>
    </div>
  );
}
