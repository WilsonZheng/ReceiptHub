import { useSyncStatus, type SyncStatus } from '../../sync/useSync';
import { useT } from '../../lib/i18n';

const COLORS: Record<SyncStatus, string> = {
  idle: 'var(--color-accent)',
  syncing: 'var(--color-warning)',
  offline: 'var(--color-ink-muted)',
  error: 'var(--color-danger)',
};

export function SyncDot() {
  const { status, pending } = useSyncStatus();
  const t = useT();
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-xs font-semibold"
      style={{ color: 'var(--color-ink-muted)' }}
      title={t(`status_${status}`)}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: COLORS[status] }}
      />
      {pending > 0 ? `${pending} ${t('pendingUnit')}` : ''}
    </span>
  );
}
