import { useState } from 'react';
import { KeyRound } from 'lucide-react';
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
    <div className="app-shell mx-auto flex w-full max-w-sm flex-col justify-center px-6">
      <div className="flex flex-col gap-4" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3">
          <span className="panel flex h-12 w-12 items-center justify-center rounded-2xl">
            <KeyRound
              className="icon-lg"
              style={{ color: 'var(--color-accent)' }}
              aria-hidden="true"
            />
          </span>
          <h1 className="text-3xl font-black italic tracking-tighter">
            ReceiptHub<span style={{ color: 'var(--color-accent)' }}>.</span>
          </h1>
        </div>
        <div className="panel panel-pad flex flex-col gap-3">
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
            className="btn-primary btn-glow w-full disabled:opacity-40 disabled:shadow-none"
          >
            {t('unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}
