import { useState } from 'react';
import { useT, type MsgKey } from '../../lib/i18n';

export type Tab = 'capture' | 'receipts' | 'stats' | 'export' | 'settings';

// 高频三项直达；低频项收进 ⋯ 菜单
const PRIMARY: { id: Tab; labelKey: MsgKey; icon: string }[] = [
  { id: 'capture', labelKey: 'tabCapture', icon: '📷' },
  { id: 'receipts', labelKey: 'tabReceipts', icon: '📋' },
  { id: 'stats', labelKey: 'tabStats', icon: '📊' },
];
const MORE: { id: Tab; labelKey: MsgKey; icon: string }[] = [
  { id: 'export', labelKey: 'tabExport', icon: '📤' },
  { id: 'settings', labelKey: 'tabSettings', icon: '⚙️' },
];

export function TopNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const moreActive = MORE.some((m) => m.id === tab);

  return (
    <nav className="relative flex items-center gap-1.5 px-4 pb-2">
      {PRIMARY.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className="flex-1 rounded-full px-2 py-2 text-xs font-semibold"
          style={
            tab === item.id
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
          }
          aria-current={tab === item.id}
        >
          {item.icon} {t(item.labelKey)}
        </button>
      ))}
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('more')}
        aria-expanded={open}
        className="rounded-full px-3.5 py-2 text-xs font-bold"
        style={
          moreActive
            ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
            : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
        }
      >
        ⋯
      </button>

      {open && (
        <>
          {/* 点击菜单外任意处关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-4 top-full z-50 mt-1 flex min-w-36 flex-col overflow-hidden rounded-xl border shadow-lg"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            {MORE.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-3 text-left text-sm font-medium"
                style={tab === item.id ? { color: 'var(--color-accent)' } : {}}
              >
                <span>{item.icon}</span> {t(item.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
