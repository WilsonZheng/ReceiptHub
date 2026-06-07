import { useState } from 'react';
import { setPat, DATA_REPO } from '../lib/settings';
import { useT } from '../lib/i18n';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const t = useT();
  return (
    <div
      className="mx-auto flex h-dvh max-w-sm flex-col items-center justify-center gap-4 px-8"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <h1 className="text-2xl font-bold">ReceiptHub</h1>
      <p className="text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        {t('lockInstruction')} <code>{DATA_REPO}</code>
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="github_pat_…"
        className="field"
      />
      <button
        disabled={!value.trim()}
        onClick={() => {
          setPat(value);
          onUnlock();
        }}
        className="w-full rounded-lg py-2 font-semibold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        {t('unlock')}
      </button>
    </div>
  );
}
