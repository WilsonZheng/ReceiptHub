import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { clearPat, getConfig, setConfig, DATA_REPO } from '../lib/settings';
import { setLocale, useLocale, useT, type Locale } from '../lib/i18n';
import { setTheme, useTheme, type Theme } from '../lib/theme';
import { syncNow, useSyncStatus } from '../sync/useSync';
import type { AppConfig, Kind, Space } from '../data/types';

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-semibold"
      style={
        active
          ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
          : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
      }
    >
      {label}
    </button>
  );
}

export function SettingsScreen({ onPatCleared }: { onPatCleared: () => void }) {
  const { status, pending } = useSyncStatus();
  const [counts, setCounts] = useState({ receipts: 0, photos: 0 });
  const [config, setLocalConfig] = useState(getConfig());
  const [newCat, setNewCat] = useState('');
  const [catSpace, setCatSpace] = useState<Space>('company');
  const [catKind, setCatKind] = useState<Kind>('expense');
  const locale = useLocale();
  const theme = useTheme();
  const t = useT();

  useEffect(() => {
    void Promise.all([db.receipts.count(), db.photos.count()]).then(([receipts, photos]) =>
      setCounts({ receipts, photos }),
    );
  }, []);

  function addCategory() {
    if (!newCat.trim()) return;
    const next: AppConfig = {
      categories: {
        ...config.categories,
        [catSpace]: {
          ...config.categories[catSpace],
          [catKind]: [...config.categories[catSpace][catKind], newCat.trim()],
        },
      },
    };
    setConfig(next);
    setLocalConfig(next);
    setNewCat('');
  }
  function removeCategory(space: Space, kind: Kind, cat: string) {
    const next: AppConfig = {
      categories: {
        ...config.categories,
        [space]: {
          ...config.categories[space],
          [kind]: config.categories[space][kind].filter((c) => c !== cat),
        },
      },
    };
    setConfig(next);
    setLocalConfig(next);
  }

  const LOCALES: { value: Locale; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' },
  ];
  const THEMES: { value: Theme; labelKey: 'dark' | 'light' }[] = [
    { value: 'dark', labelKey: 'dark' },
    { value: 'light', labelKey: 'light' },
  ];

  return (
    <div className="flex flex-col gap-4 py-2 text-sm">
      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">{t('preferences')}</h3>
        <div className="mt-2 flex items-center justify-between">
          <span style={{ color: 'var(--color-ink-muted)' }}>{t('language')}</span>
          <div className="flex gap-1.5">
            {LOCALES.map((l) => (
              <Pill
                key={l.value}
                active={locale === l.value}
                label={l.label}
                onClick={() => setLocale(l.value)}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span style={{ color: 'var(--color-ink-muted)' }}>{t('theme')}</span>
          <div className="flex gap-1.5">
            {THEMES.map((th) => (
              <Pill
                key={th.value}
                active={theme === th.value}
                label={t(th.labelKey)}
                onClick={() => setTheme(th.value)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">{t('sync')}</h3>
        <p style={{ color: 'var(--color-ink-muted)' }}>
          {t(`status_${status}`)} · {pending} {t('pendingUnit')} · {counts.receipts}{' '}
          {t('receiptsUnit')} · {counts.photos} {t('photosUnit')}
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => void syncNow()} className="btn-secondary">
            {t('syncNow')}
          </button>
          <a
            className="btn-secondary inline-block"
            href={`https://github.com/${DATA_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('dataRepo')} ↗
          </a>
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">{t('categories')}</h3>
        {(['company', 'personal'] as const).map((sp) => (
          <div key={sp} className="mt-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--color-ink-muted)' }}>
              {t(sp)}
            </p>
            {(['expense', 'income'] as const).map((k) => (
              <div key={k} className="mt-1">
                <p className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {t(k)}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {config.categories[sp][k].map((c) => (
                    <span
                      key={c}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ background: 'var(--color-surface-2)' }}
                    >
                      {c}{' '}
                      <button onClick={() => removeCategory(sp, k, c)} aria-label={`Remove ${c}`}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <select
            value={catSpace}
            onChange={(e) => setCatSpace(e.target.value as Space)}
            className="field w-auto"
          >
            <option value="company">{t('company')}</option>
            <option value="personal">{t('personal')}</option>
          </select>
          <select
            value={catKind}
            onChange={(e) => setCatKind(e.target.value as Kind)}
            className="field w-auto"
          >
            <option value="expense">{t('expense')}</option>
            <option value="income">{t('income')}</option>
          </select>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder={t('newCategory')}
            className="field"
          />
          <button
            onClick={addCategory}
            className="whitespace-nowrap rounded-lg px-3"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {t('add')}
          </button>
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">{t('access')}</h3>
        <button
          onClick={() => {
            clearPat();
            onPatCleared();
          }}
          className="mt-2 rounded-lg px-3 py-1.5"
          style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
        >
          {t('clearPat')}
        </button>
      </section>
    </div>
  );
}
