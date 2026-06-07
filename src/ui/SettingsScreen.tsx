import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { clearPat, getConfig, setConfig, DATA_REPO } from '../lib/settings';
import { syncNow, useSyncStatus } from '../sync/useSync';
import type { Space } from '../data/types';

export function SettingsScreen({ onPatCleared }: { onPatCleared: () => void }) {
  const { status, pending } = useSyncStatus();
  const [counts, setCounts] = useState({ receipts: 0, photos: 0 });
  const [config, setLocalConfig] = useState(getConfig());
  const [newCat, setNewCat] = useState('');
  const [catSpace, setCatSpace] = useState<Space>('company');

  useEffect(() => {
    void Promise.all([db.receipts.count(), db.photos.count()]).then(([receipts, photos]) =>
      setCounts({ receipts, photos }),
    );
  }, []);

  function addCategory() {
    if (!newCat.trim()) return;
    const next = {
      categories: {
        ...config.categories,
        [catSpace]: [...config.categories[catSpace], newCat.trim()],
      },
    };
    setConfig(next);
    setLocalConfig(next);
    setNewCat('');
  }
  function removeCategory(space: Space, cat: string) {
    const next = {
      categories: {
        ...config.categories,
        [space]: config.categories[space].filter((c) => c !== cat),
      },
    };
    setConfig(next);
    setLocalConfig(next);
  }

  return (
    <div className="flex flex-col gap-4 py-2 text-sm">
      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Sync</h3>
        <p style={{ color: 'var(--color-ink-muted)' }}>
          {status} · {pending} pending · {counts.receipts} receipts · {counts.photos} photos ·{' '}
          <a
            className="underline"
            href={`https://github.com/${DATA_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            data repo
          </a>
        </p>
        <button
          onClick={() => void syncNow()}
          className="mt-2 rounded-lg px-3 py-1.5"
          style={{ background: 'var(--color-surface-2)' }}
        >
          Sync now
        </button>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Categories</h3>
        {(['company', 'personal'] as const).map((sp) => (
          <div key={sp} className="mt-2">
            <p className="text-xs capitalize" style={{ color: 'var(--color-ink-muted)' }}>
              {sp}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {config.categories[sp].map((c) => (
                <span
                  key={c}
                  className="rounded-full px-2.5 py-1 text-xs"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  {c}{' '}
                  <button onClick={() => removeCategory(sp, c)} aria-label={`Remove ${c}`}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <select
            value={catSpace}
            onChange={(e) => setCatSpace(e.target.value as Space)}
            className="field w-auto"
          >
            <option value="company">company</option>
            <option value="personal">personal</option>
          </select>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category"
            className="field"
          />
          <button
            onClick={addCategory}
            className="rounded-lg px-3"
            style={{ background: 'var(--color-surface-2)' }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Access</h3>
        <button
          onClick={() => {
            clearPat();
            onPatCleared();
          }}
          className="mt-2 rounded-lg px-3 py-1.5"
          style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
        >
          Clear PAT & lock
        </button>
      </section>
    </div>
  );
}
