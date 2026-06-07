import type { Space } from '../../data/types';

export function SpaceToggle({ space, onChange }: { space: Space; onChange: (s: Space) => void }) {
  return (
    <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
      {(['company', 'personal'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
          style={
            space === s
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { color: 'var(--color-ink-muted)' }
          }
        >
          {s}
        </button>
      ))}
    </div>
  );
}
