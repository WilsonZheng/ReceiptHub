import type { Space } from '../../data/types';
import { useT } from '../../lib/i18n';

export function SpaceToggle({ space, onChange }: { space: Space; onChange: (s: Space) => void }) {
  const t = useT();
  return (
    <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
      {(['company', 'personal'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="min-h-9 rounded-full px-3 py-1 text-xs font-bold sm:min-h-10 sm:px-4 sm:text-sm"
          style={
            space === s
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { color: 'var(--color-ink-muted)' }
          }
        >
          {t(s)}
        </button>
      ))}
    </div>
  );
}
