export type Tab = 'capture' | 'receipts' | 'export' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'capture', label: 'Capture', icon: '📷' },
  { id: 'receipts', label: 'Receipts', icon: '📋' },
  { id: 'export', label: 'Export', icon: '📤' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="flex justify-around border-t pb-[env(safe-area-inset-bottom)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="flex min-h-11 flex-col items-center px-4 py-1.5 text-[10px]"
          style={{ opacity: tab === t.id ? 1 : 0.4 }}
          aria-current={tab === t.id}
        >
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
