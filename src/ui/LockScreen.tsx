import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { DATA_REPO, setPat } from '../lib/settings';
import { GithubClient } from '../sync/github';
import { useT } from '../lib/i18n';

// 锁屏刻意极简：只有一个"密码"框，不提及 GitHub/PAT/仓库等任何机制信息
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const t = useT();

  // 先验证再放行：以前输错也能进去，要等到同步失败才发现，票据还一直传不上去
  async function handleUnlock() {
    const v = value.trim();
    if (!v || checking) return;
    setChecking(true);
    setWrong(false);
    let ok = true;
    try {
      ok = await new GithubClient(v, DATA_REPO).canAccess();
    } catch {
      // 断网或服务暂时不可用：照样放行（本地优先），密码真有问题时同步会再提示
    }
    setChecking(false);
    if (!ok) return setWrong(true);
    setPat(v);
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
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setWrong(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void handleUnlock()}
              placeholder={t('password')}
              aria-label={t('password')}
              aria-invalid={wrong}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="field"
              // .field 不在 @layer 里，pr-* 工具类无效——内联
              style={{
                paddingRight: '3rem',
                borderColor: wrong ? 'var(--color-danger)' : undefined,
              }}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={t('showPassword')}
              aria-pressed={show}
              className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              {show ? (
                <EyeOff className="icon" aria-hidden="true" />
              ) : (
                <Eye className="icon" aria-hidden="true" />
              )}
            </button>
          </div>
          {wrong && (
            <p className="text-sm" role="alert" style={{ color: 'var(--color-danger)' }}>
              {t('wrongPassword')}
            </p>
          )}
          <button
            disabled={!value.trim() || checking}
            onClick={() => void handleUnlock()}
            className="btn-primary btn-glow w-full disabled:opacity-40 disabled:shadow-none"
          >
            {checking ? t('unlocking') : t('unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}
