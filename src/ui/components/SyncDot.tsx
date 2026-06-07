import { useSyncStatus, type SyncStatus } from '../../sync/useSync';

const COLORS: Record<SyncStatus, string> = {
  idle: 'var(--color-accent)',
  syncing: '#f0b429',
  offline: 'var(--color-ink-muted)',
  error: 'var(--color-danger)',
};

export function SyncDot() {
  const { status, pending } = useSyncStatus();
  return (
    <span
      className="flex items-center gap-1 text-[10px]"
      style={{ color: 'var(--color-ink-muted)' }}
      title={`sync: ${status}`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[status] }} />
      {pending > 0 ? `${pending} pending` : ''}
    </span>
  );
}
