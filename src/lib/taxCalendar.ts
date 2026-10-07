// 公司（3/31 结账、已注册 GST）每年要跟 IRD / Companies Office 打交道的截止日。
// 纯函数：输入"你的情况"和今天，输出一段时间窗口内的待办，按截止日排序。
// 日期规则来源：IRD 官网（GST、所得税、预缴税、PAYE）与 Companies Office（年度申报）。
import { gstDueDate, periodAt, type GstFrequency } from './periods';

export type Provisional = 'no' | 'standard' | 'unsure';

export interface TaxProfile {
  gstFreq: GstFrequency;
  hasAgent: boolean; // 有税务代理：所得税申报延到次年 3/31、年终税延到 4/7
  provisional: Provisional; // 上年年终应缴超过 $5,000 才需要预缴
  payeEmployer: boolean; // 通过 PAYE 给自己或员工发工资
  annualReturnMonth: number | null; // Companies Office 年度申报月份 1–12；null = 不知道
}

interface Base {
  id: string; // 稳定 id：用于"已完成"状态
  due: string; // YYYY-MM-DD（名义截止日；遇周末/公众假期顺延到下一个工作日）
}
export type TaxTask =
  | (Base & { kind: 'gst'; from: string; to: string; startYm: string; endYm: string })
  | (Base & { kind: 'incomeTax'; fyEndYm: string })
  | (Base & { kind: 'terminalTax'; fyEndYm: string })
  | (Base & { kind: 'provisional'; fyEndYm: string; n: number; total: number })
  | (Base & { kind: 'paye'; month: string })
  | (Base & { kind: 'annualReturn'; month: string });

const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 两个日期相差的天数（b − a） */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/** 窗口 [today − backDays, today + aheadDays] 内的全部待办，按截止日排序 */
export function taxTasks(
  p: TaxProfile,
  todayIso: string,
  { backDays = 60, aheadDays = 400 }: { backDays?: number; aheadDays?: number } = {},
): TaxTask[] {
  const lo = addDays(todayIso, -backDays);
  const hi = addDays(todayIso, aheadDays);
  const year = Number(todayIso.slice(0, 4));
  const tasks: TaxTask[] = [];

  // GST：每期期末次月 28 日（3 月 → 5/7，11 月 → 次年 1/15）
  for (let k = -14; k <= 14; k++) {
    const per = periodAt(todayIso, 'gst', p.gstFreq, k);
    tasks.push({
      id: `gst:${per.endYm}`,
      kind: 'gst',
      due: gstDueDate(per.endYm),
      from: per.from,
      to: per.to,
      startYm: per.startYm,
      endYm: per.endYm,
    });
  }

  // 财年相关：Y = 财年结束那年（截至 Y 年 3 月 31 日）
  for (let y = year - 2; y <= year + 2; y++) {
    const fyEndYm = `${y}-03`;
    tasks.push({
      id: `incomeTax:${y}`,
      kind: 'incomeTax',
      fyEndYm,
      due: p.hasAgent ? `${y + 1}-03-31` : `${y}-07-07`,
    });
    tasks.push({
      id: `terminalTax:${y}`,
      kind: 'terminalTax',
      fyEndYm,
      due: p.hasAgent ? `${y + 1}-04-07` : `${y + 1}-02-07`,
    });
    if (p.provisional === 'standard') {
      // 标准法分 3 期；每半年报 GST 的只分 2 期（10/28、5/7）
      const dues =
        p.gstFreq === 'six'
          ? [`${y - 1}-10-28`, `${y}-05-07`]
          : [`${y - 1}-08-28`, `${y}-01-15`, `${y}-05-07`];
      dues.forEach((due, i) =>
        tasks.push({
          id: `provisional:${y}:${i + 1}`,
          kind: 'provisional',
          fyEndYm,
          n: i + 1,
          total: dues.length,
          due,
        }),
      );
    }
  }

  // PAYE（年 PAYE 低于 $500,000 的小雇主）：上月扣缴的税次月 20 日前缴
  if (p.payeEmployer) {
    for (let k = -4; k <= 14; k++) {
      const d = new Date(Date.UTC(year, Number(todayIso.slice(5, 7)) - 1 + k, 1));
      const month = d.toISOString().slice(0, 7);
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 20));
      tasks.push({
        id: `paye:${month}`,
        kind: 'paye',
        month,
        due: next.toISOString().slice(0, 10),
      });
    }
  }

  // Companies Office 年度申报：申报月份内任意一天，截止为该月最后一天
  if (p.annualReturnMonth) {
    for (let y = year - 1; y <= year + 1; y++) {
      tasks.push({
        id: `annualReturn:${y}`,
        kind: 'annualReturn',
        month: `${y}-${pad(p.annualReturnMonth)}`,
        due: lastDayOf(y, p.annualReturnMonth),
      });
    }
  }

  return tasks
    .filter((t) => t.due >= lo && t.due <= hi)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id < b.id ? -1 : 1));
}

/** 紧急程度：逾期 / 14 天内 / 之后 */
export type Urgency = 'overdue' | 'soon' | 'later';
export function urgencyOf(due: string, todayIso: string): Urgency {
  const d = daysBetween(todayIso, due);
  if (d < 0) return 'overdue';
  if (d <= 14) return 'soon';
  return 'later';
}
