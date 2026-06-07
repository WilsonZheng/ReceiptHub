import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { clearPat, getConfig, setConfig, DATA_REPO } from '../lib/settings';
import { setLocale, useLocale, useT, type Locale } from '../lib/i18n';
import { categoryLabel } from '../lib/categories';
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

/** 组尾的"＋"占位 chip：点击就地变输入框，Enter/失焦提交，Esc 取消 */
function AddChip({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const t = useT();

  function commit() {
    const name = value.trim();
    if (name) onAdd(name);
    setValue('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded-full border border-dashed px-2.5 py-1 text-xs"
        style={{
          borderColor: 'var(--color-ink-muted)',
          color: 'var(--color-ink-muted)',
          background: 'transparent',
        }}
      >
        ＋ {t('add')}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setValue('');
          setEditing(false);
        }
      }}
      placeholder={t('newCategory')}
      className="w-32 rounded-full px-2.5 py-1 text-xs"
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-accent)',
        outline: 'none',
        color: 'var(--color-ink)',
      }}
    />
  );
}

export function SettingsScreen({ onPatCleared }: { onPatCleared: () => void }) {
  const { status, pending } = useSyncStatus();
  const [counts, setCounts] = useState({ receipts: 0, photos: 0 });
  const [config, setLocalConfig] = useState(getConfig());
  const locale = useLocale();
  const theme = useTheme();
  const t = useT();

  useEffect(() => {
    // 软删除的墓碑记录不计入统计；liveQuery 让删除后立刻刷新
    const sub = liveQuery(async () => {
      const alive = await db.receipts.filter((r) => !r.deleted).toArray();
      const ids = new Set(alive.map((r) => r.id));
      const photos = await db.photos.filter((p) => ids.has(p.receiptId)).count();
      return { receipts: alive.length, photos };
    }).subscribe({ next: setCounts });
    return () => sub.unsubscribe();
  }, []);

  function addCategory(space: Space, kind: Kind, name: string) {
    if (config.categories[space][kind].includes(name)) return; // 去重
    const next: AppConfig = {
      categories: {
        ...config.categories,
        [space]: {
          ...config.categories[space],
          [kind]: [...config.categories[space][kind], name],
        },
      },
    };
    setConfig(next);
    setLocalConfig(next);
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

      {/* 分类管理：公司 / 个人 各自独立卡片，组尾 ＋ 就地添加 */}
      {(['company', 'personal'] as const).map((sp) => (
        <section key={sp} className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
          <h3 className="font-bold">
            {t('categories')} · {t(sp)}
          </h3>
          {(['expense', 'income'] as const).map((k) => (
            <div key={k} className="mt-2.5">
              <p
                className="text-[10px] font-semibold tracking-wide"
                style={{ color: 'var(--color-ink-muted)' }}
              >
                {t(k)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {config.categories[sp][k].map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-1 text-xs"
                    style={{ background: 'var(--color-surface-2)' }}
                  >
                    {categoryLabel(c, locale)}{' '}
                    <button onClick={() => removeCategory(sp, k, c)} aria-label={`Remove ${c}`}>
                      ✕
                    </button>
                  </span>
                ))}
                <AddChip onAdd={(name) => addCategory(sp, k, name)} />
              </div>
            </div>
          ))}
        </section>
      ))}

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
