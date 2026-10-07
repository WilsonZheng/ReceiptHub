import { localToday, formatMonth } from '../lib/dates';
import { fyName } from '../lib/periods';
import { taxTasks, urgencyOf, daysBetween, type TaxTask } from '../lib/taxCalendar';
import { getDoneTasks, getTaxProfile, useTaxStateVersion } from '../lib/taxState';
import { formatMonthRange } from '../lib/dates';
import type { Locale, MsgKey } from '../lib/i18n';

/** 税务待办的共享视图：导航角标、顶部横幅、税务页都用它，状态一改三处同步 */
export function useTaxAgenda() {
  useTaxStateVersion();
  const today = localToday();
  const profile = getTaxProfile();
  const done = getDoneTasks();
  const all = taxTasks(profile, today);
  const pending = all.filter((t) => !done.has(t.id));
  const urgent = pending.filter((t) => urgencyOf(t.due, today) !== 'later');
  return { today, profile, all, done, pending, urgent };
}

type T = (k: MsgKey) => string;
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export function taskTitle(task: TaxTask, locale: Locale, t: T): string {
  switch (task.kind) {
    case 'gst':
      return fill(t('taskGst'), { p: formatMonthRange(task.startYm, task.endYm, locale) });
    case 'incomeTax':
      return fill(t('taskIncomeTax'), { y: fyName(task.fyEndYm) });
    case 'terminalTax':
      return fill(t('taskTerminalTax'), { y: fyName(task.fyEndYm) });
    case 'provisional':
      return fill(t('taskProvisional'), {
        n: task.n,
        total: task.total,
        y: fyName(task.fyEndYm),
      });
    case 'paye':
      return fill(t('taskPaye'), { m: formatMonth(task.month, locale) });
    case 'annualReturn':
      return t('taskAnnualReturn');
  }
}

/** 第二行说明（GST 的金额估算由页面另算，这里不含） */
export function taskSubtitle(task: TaxTask, locale: Locale, t: T): string | null {
  switch (task.kind) {
    case 'incomeTax':
      return t('taskIncomeTaxSub');
    case 'terminalTax':
      return t('taskTerminalTaxSub');
    case 'provisional':
      return t('taskProvisionalSub');
    case 'paye':
      return t('taskPayeSub');
    case 'annualReturn':
      return fill(t('taskAnnualReturnSub'), { m: formatMonth(task.month, locale) });
    default:
      return null;
  }
}

/** "还有 21 天" / "今天截止" / "已逾期 3 天" */
export function whenText(due: string, today: string, t: T): string {
  const d = daysBetween(today, due);
  if (d === 0) return t('dueToday');
  return d > 0 ? fill(t('daysLeft'), { n: d }) : fill(t('daysOverdue'), { n: -d });
}

export { fill };
