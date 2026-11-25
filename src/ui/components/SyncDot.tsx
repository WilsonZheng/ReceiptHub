import { syncNow, useSyncStatus, type SyncStatus } from '../../sync/useSync';
import { useT } from '../../lib/i18n';

const COLORS: Record<SyncStatus, string> = {
  idle: 'var(--color-accent)',
  syncing: 'var(--color-warning)',
  offline: 'var(--color-ink-muted)',
  error: 'var(--color-danger)',
};

/** 同步状态：平时只是一个点；出错或离线时把原因写出来（只看颜色猜不出是什么意思），点一下立即重试 */
export function SyncDot() {
  const { status, pending } = useSyncStatus();
  const t = useT();
  const problem =
    status === 'error' ? t('syncFailed') : status === 'offline' ? t('status_offline') : '';
  const text = [problem, pending > 0 ? `${pending} ${t('pendingUnit')}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-xs font-semibold"
      style={{ color: status === 'error' ? 'var(--color-danger)' : 'var(--color-ink-muted)' }}
      title={t(`status_${status}`)}
      aria-label={`${t(`status_${status}`)}${pending > 0 ? ` · ${pending} ${t('pendingUnit')}` : ''} · ${t('syncTapHint')}`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${status === 'syncing' ? 'sync-pulse' : ''}`}
        style={{ background: COLORS[status] }}
      />
      {text}
    </button>
  );
}
