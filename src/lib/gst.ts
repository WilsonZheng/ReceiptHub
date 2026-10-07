import { kindOf, type Receipt } from '../data/types';

/**
 * IRD GST 申报表（GST101A / myIR）各栏，按 IRD 的算法：GST 由含税总额 × 3/23 反推（第 8、12 栏），
 * 而不是逐张票据 GST 的加总——这样与 myIR 自动算出的数字分毫不差。
 * 未含调整项（第 9、13 栏），故第 10 栏 = 第 8 栏、第 14 栏 = 第 12 栏。
 */
export interface GstReturn {
  box5: number; // 销售与收入总额（含 GST，含零税率；不含免税收入）
  box6: number; // 零税率销售
  box8: number; // 销项 GST = (第 5 栏 − 第 6 栏) × 3/23
  box11: number; // 可抵扣的采购与费用总额（含 GST）
  box12: number; // 进项 GST = 第 11 栏 × 3/23
  box15: number; // 第 8 栏 − 第 12 栏：正数应缴 IRD，负数 IRD 应退
}

// 利息收入属于免税的金融服务，不进 GST 申报（内置分类的规范名）
const EXEMPT_INCOME = new Set(['Interest']);

const gstOf = (cents: number) => Math.round((cents * 3) / 23);

export function gstReturn(receipts: Receipt[]): GstReturn {
  let box5 = 0;
  let box6 = 0;
  let box11 = 0;
  for (const r of receipts) {
    if (r.deleted || r.space !== 'company') continue;
    if (kindOf(r) === 'income') {
      if (EXEMPT_INCOME.has(r.category)) continue;
      box5 += r.totalCents;
      if (r.gstCents === 0) box6 += r.totalCents; // 无 GST 的收入按零税率申报
    } else if (r.gstCents > 0) {
      box11 += r.totalCents; // 无 GST 的支出没有可抵扣的进项
    }
  }
  const box8 = gstOf(box5 - box6);
  const box12 = gstOf(box11);
  return { box5, box6, box8, box11, box12, box15: box8 - box12 };
}

/**
 * 招待费 GST 年度调整（IRD：招待费一般只能抵扣 50%，每年在一期 GST 申报的第 9 栏加回）。
 * 按"餐饮招待"分类全额估算——出差途中自己的餐费通常可全额抵扣，实际应加回的可能更少。
 */
export function entertainmentAdjustment(receipts: Receipt[]): number {
  let total = 0;
  for (const r of receipts) {
    if (r.deleted || r.space !== 'company' || kindOf(r) !== 'expense') continue;
    if (r.category === 'Meals & Entertainment' && r.gstCents > 0) total += r.totalCents;
  }
  return Math.round((total * 3) / 23 / 2);
}
