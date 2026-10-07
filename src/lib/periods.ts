// NZ 税务期间：财年（4/1–3/31）、GST 申报期（按申报频率）、自然月/年——统一成"长度 L 个月、
// 在某个月份结束"的周期模型，前后翻页只是把结束月平移 k×L。

/** GST 申报频率。two-odd = 每两月、单数月结束（1/3/5…月，3/31 结账企业的默认）；six = 每半年、3 月和 9 月结束 */
export type GstFrequency = 'monthly' | 'two-odd' | 'two-even' | 'six';
export type PeriodMode = 'month' | 'gst' | 'fy' | 'year';

export interface Period {
  from: string; // YYYY-MM-DD（含）
  to: string; // YYYY-MM-DD（含）
  startYm: string;
  endYm: string;
  months: number;
}

// len = 周期月数；endM0 = 任意一个结束月（0 起的月份），其余结束月按 len 推出
function spec(mode: PeriodMode, freq: GstFrequency): { len: number; endM0: number } {
  if (mode === 'month') return { len: 1, endM0: 0 };
  if (mode === 'year') return { len: 12, endM0: 11 };
  if (mode === 'fy') return { len: 12, endM0: 2 }; // 3 月结束
  if (freq === 'monthly') return { len: 1, endM0: 0 };
  if (freq === 'two-odd') return { len: 2, endM0: 0 }; // 1 月结束 → 1/3/5/7/9/11 月
  if (freq === 'two-even') return { len: 2, endM0: 1 }; // 2 月结束 → 2/4/6/8/10/12 月
  return { len: 6, endM0: 2 }; // 3 月、9 月结束
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const pad = (n: number) => String(n).padStart(2, '0');
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const ymOf = (idx: number) => `${Math.floor(idx / 12)}-${pad(mod(idx, 12) + 1)}`;
const lastDay = (idx: number) => new Date(Date.UTC(Math.floor(idx / 12), mod(idx, 12) + 1, 0));

function endIndexContaining(iso: string, mode: PeriodMode, freq: GstFrequency): number {
  const { len, endM0 } = spec(mode, freq);
  const t = monthIndex(iso);
  return t + mod(endM0 - t, len);
}

/** 包含 todayIso 的那一期，再平移 offset 期（负数 = 往前） */
export function periodAt(
  todayIso: string,
  mode: PeriodMode,
  freq: GstFrequency,
  offset = 0,
): Period {
  const { len } = spec(mode, freq);
  const end = endIndexContaining(todayIso, mode, freq) + offset * len;
  const start = end - len + 1;
  return {
    from: `${ymOf(start)}-01`,
    to: lastDay(end).toISOString().slice(0, 10),
    startYm: ymOf(start),
    endYm: ymOf(end),
    months: len,
  };
}

/** dateIso 所在期相对 todayIso 所在期的偏移量（用于限制翻页范围） */
export function periodOffsetOf(
  dateIso: string,
  todayIso: string,
  mode: PeriodMode,
  freq: GstFrequency,
): number {
  const { len } = spec(mode, freq);
  return (endIndexContaining(dateIso, mode, freq) - endIndexContaining(todayIso, mode, freq)) / len;
}

/**
 * GST 申报与缴款截止日（IRD）：期末次月 28 日；例外——3 月结束的期 5 月 7 日，11 月结束的期次年 1 月 15 日。
 */
export function gstDueDate(endYm: string): string {
  const y = Number(endYm.slice(0, 4));
  const m = Number(endYm.slice(5, 7));
  if (m === 3) return `${y}-05-07`;
  if (m === 11) return `${y + 1}-01-15`;
  return m === 12 ? `${y + 1}-01-28` : `${y}-${pad(m + 1)}-28`;
}

/** 财年简称：截至 2027-03 的财年 → "2026–27" */
export function fyName(endYm: string): string {
  const y = Number(endYm.slice(0, 4));
  return `${y - 1}–${String(y).slice(2)}`;
}

/** 所得税申报截止日（IR3/IR4，3/31 结账、无税务代理）：财年结束后的 7 月 7 日 */
export function incomeTaxDueDate(fyEndYm: string): string {
  return `${fyEndYm.slice(0, 4)}-07-07`;
}
