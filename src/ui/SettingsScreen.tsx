import { Fragment, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { Eye, EyeOff, ExternalLink, Languages, RefreshCw, X } from 'lucide-react';
import { db } from '../data/db';
import {
  addCategoryToConfig,
  clearPat,
  getAiKey,
  getConfig,
  setAiKey,
  setCategoryLabel,
  setConfig,
  DATA_REPO,
} from '../lib/settings';
import { AddChip } from './components/AddChip';
import { setLocale, useLocale, useT, type Locale } from '../lib/i18n';
import { categoryLabel, isBuiltinCategory } from '../lib/categories';
import { setTheme, useTheme, type Theme } from '../lib/theme';
import { syncNow, useSyncStatus } from '../sync/useSync';
import type { AppConfig, Kind, Space } from '../data/types';

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="segmented-btn"
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
  const [aiKey, setAiKeyLocal] = useState(getAiKey() ?? '');
  const [aiSaved, setAiSaved] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  // 自定义分类的双语译名就地编辑：一次编辑一个，editingLabel 存 canonical key
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
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
    setLocalConfig(addCategoryToConfig(space, kind, name));
  }
  // 打开/提交"当前语言下的显示名"编辑：改的是显示层，canonical key 不动
  function openLabelEditor(cat: string) {
    setEditingLabel(cat);
    setLabelDraft(config.labels?.[cat]?.[locale] ?? '');
  }
  function commitLabel() {
    if (editingLabel) setLocalConfig(setCategoryLabel(editingLabel, locale, labelDraft));
    setEditingLabel(null);
    setLabelDraft('');
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
    <div className="screen-wrap grid gap-4 py-2 text-sm lg:grid-cols-2 lg:items-start">
      <section className="panel panel-pad">
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

      <section className="panel panel-pad">
        <h3 className="font-bold">{t('aiTitle')}</h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {t('aiHint')}
        </p>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            type={showAiKey ? 'text' : 'password'}
            value={aiKey}
            onChange={(e) => setAiKeyLocal(e.target.value)}
            placeholder={t('aiKeyPlaceholder')}
            className="field"
          />
          <button
            onClick={() => setShowAiKey(!showAiKey)}
            aria-label={t('toggleKeyVisibility')}
            className="btn-secondary px-3"
          >
            {showAiKey ? (
              <EyeOff className="icon" aria-hidden="true" />
            ) : (
              <Eye className="icon" aria-hidden="true" />
            )}
          </button>
          <button
            onClick={() => {
              setAiKey(aiKey);
              setAiSaved(true);
              setTimeout(() => setAiSaved(false), 1500);
            }}
            className="btn-secondary whitespace-nowrap"
          >
            {aiSaved ? '✓' : t('saveKey')}
          </button>
        </div>
        {aiKey && (
          <button
            onClick={() => {
              setAiKey('');
              setAiKeyLocal('');
              setShowAiKey(false);
            }}
            className="mt-2 rounded-lg px-3 py-1.5 text-xs"
            style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
          >
            {t('remove')}
          </button>
        )}
      </section>

      <section className="panel panel-pad">
        <h3 className="font-bold">{t('sync')}</h3>
        <p style={{ color: 'var(--color-ink-muted)' }}>
          {t(`status_${status}`)} · {pending} {t('pendingUnit')} · {counts.receipts}{' '}
          {t('receiptsUnit')} · {counts.photos} {t('photosUnit')}
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => void syncNow()} className="btn-secondary">
            <RefreshCw className="icon" aria-hidden="true" />
            {t('syncNow')}
          </button>
          <a
            className="btn-secondary inline-block"
            href={`https://github.com/${DATA_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('dataRepo')} <ExternalLink className="icon" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* 分类管理：公司 / 个人 各自独立卡片，组尾 ＋ 就地添加 */}
      {(['company', 'personal'] as const).map((sp) => (
        <section key={sp} className="panel panel-pad">
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
                  <Fragment key={c}>
                    <span
                      className="chip-btn inline-flex items-center gap-1"
                      style={{ background: 'var(--color-surface-2)' }}
                    >
                      {categoryLabel(c, locale, config.labels)}{' '}
                      {/* 内置分类天然双语；自定义分类才需用户补当前语言的显示名 */}
                      {!isBuiltinCategory(c) && (
                        <button
                          onClick={() => (editingLabel === c ? commitLabel() : openLabelEditor(c))}
                          aria-label={t('setDisplayName')}
                          className="flex h-6 w-6 items-center justify-center rounded-full"
                          style={editingLabel === c ? { color: 'var(--color-accent)' } : undefined}
                        >
                          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => removeCategory(sp, k, c)}
                        aria-label={`Remove ${c}`}
                        className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                    {editingLabel === c && (
                      <input
                        autoFocus
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onBlur={commitLabel}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitLabel();
                          if (e.key === 'Escape') {
                            setEditingLabel(null);
                            setLabelDraft('');
                          }
                        }}
                        placeholder={t('displayNameIn')}
                        aria-label={t('setDisplayName')}
                        className="min-h-10 w-40 rounded-full px-3 text-base"
                        style={{
                          background: 'var(--color-surface-2)',
                          border: '1px solid var(--color-accent)',
                          outline: 'none',
                          color: 'var(--color-ink)',
                        }}
                      />
                    )}
                  </Fragment>
                ))}
                <AddChip onAdd={(name) => addCategory(sp, k, name)} />
              </div>
            </div>
          ))}
        </section>
      ))}

      <section className="panel panel-pad">
        <h3 className="font-bold">{t('access')}</h3>
        <button
          onClick={() => {
            clearPat();
            onPatCleared();
          }}
          className="btn-secondary mt-2"
          style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}
        >
          {t('clearPat')}
        </button>
      </section>
    </div>
  );
}
