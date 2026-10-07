import { useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  Camera,
  ClipboardList,
  Download,
  MoreHorizontal,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useT, type MsgKey } from '../../lib/i18n';
import { useTaxAgenda } from '../taxAgenda';

export type Tab = 'capture' | 'receipts' | 'stats' | 'tax' | 'export' | 'settings';

// 高频四项直达（税务带待办角标）；低频项收进 ⋯ 菜单
const PRIMARY: { id: Tab; labelKey: MsgKey; Icon: LucideIcon }[] = [
  { id: 'capture', labelKey: 'tabCapture', Icon: Camera },
  { id: 'receipts', labelKey: 'tabReceipts', Icon: ClipboardList },
  { id: 'stats', labelKey: 'tabStats', Icon: BarChart3 },
  { id: 'tax', labelKey: 'tabTax', Icon: CalendarClock },
];
const MORE: { id: Tab; labelKey: MsgKey; Icon: LucideIcon }[] = [
  { id: 'export', labelKey: 'tabExport', Icon: Download },
  { id: 'settings', labelKey: 'tabSettings', Icon: Settings },
];

export function TopNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const moreActive = MORE.some((m) => m.id === tab);
  // 逾期或 14 天内到期、还没完成的税务事项数
  const taxAlerts = useTaxAgenda().urgent.length;

  return (
    // 外层不带 backdrop-filter：滤镜会把 fixed 遮罩的包含块收缩到自身、并把菜单压到 main 之下
    <nav className="relative z-30 mx-4 mb-3 sm:mx-6">
      <div className="glass-dock flex items-center gap-1 rounded-2xl p-1.5">
        {PRIMARY.map(({ Icon, ...item }) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            // 手机上图标在上、文字在下：四个 Tab 放得下；宽屏横排
            className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold sm:flex-row sm:gap-1.5 sm:px-2 sm:py-2 sm:text-sm"
            style={
              tab === item.id
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                : { background: 'transparent', color: 'var(--color-ink-muted)' }
            }
            aria-current={tab === item.id}
          >
            <Icon className="icon" aria-hidden="true" />
            <span className="max-w-full truncate">{t(item.labelKey)}</span>
            {item.id === 'tax' && taxAlerts > 0 && (
              <span
                className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                style={{ background: 'var(--color-danger)', color: 'var(--color-danger-ink)' }}
              >
                {taxAlerts}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setOpen(!open)}
          aria-label={t('more')}
          aria-expanded={open}
          className="flex min-h-11 items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold"
          style={
            moreActive
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { background: 'transparent', color: 'var(--color-ink-muted)' }
          }
        >
          <MoreHorizontal className="icon-lg" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <>
          {/* 点击菜单外任意处关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel pop-in absolute right-0 top-full z-50 mt-1.5 flex min-w-40 flex-col overflow-hidden rounded-2xl">
            {MORE.map(({ Icon, ...item }) => (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="flex min-h-12 items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
                style={tab === item.id ? { color: 'var(--color-accent)' } : {}}
              >
                <Icon className="icon" aria-hidden="true" />
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
