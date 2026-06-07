import { useT, type MsgKey } from '../../lib/i18n';

export type Tab = 'capture' | 'receipts' | 'export' | 'settings';

const TABS: { id: Tab; labelKey: MsgKey; icon: string }[] = [
  { id: 'capture', labelKey: 'tabCapture', icon: '📷' },
  { id: 'receipts', labelKey: 'tabReceipts', icon: '📋' },
  { id: 'export', labelKey: 'tabExport', icon: '📤' },
  { id: 'settings', labelKey: 'tabSettings', icon: '⚙️' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const t = useT();
  return (
    <nav
      className="flex justify-around border-t pb-[env(safe-area-inset-bottom)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {TABS.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className="flex min-h-11 flex-col items-center px-4 py-1.5 text-[10px]"
          style={{ opacity: tab === item.id ? 1 : 0.4 }}
          aria-current={tab === item.id}
        >
          <span className="text-lg">{item.icon}</span>
          {t(item.labelKey)}
        </button>
      ))}
    </nav>
  );
}
