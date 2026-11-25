import { kindOf, type Kind, type Receipt, type Space } from '../data/types';
import { merchantKey } from './merchants';

/** 规则检查（不用 AI）：报税前值得再看一眼的票据 */
export type CheckKind = 'duplicate' | 'noGst' | 'bigInvoice';
export interface Check {
  id: string; // 稳定 id：用户点"没问题"后不再提示
  kind: CheckKind;
  receiptIds: string[];
}

// 这些分类在 NZ 几乎总是含 GST；存成无 GST 多半是漏选（规范名，见 types.ts 默认分类）
const USUALLY_GST = new Set(['Fuel', 'Office Supplies', 'Equipment', 'Parking']);

/** fromIso 之后的公司票据：可能重复、该有 GST 却没有、超过 $1,000 需核对发票抬头 */
export function receiptChecks(receipts: Receipt[], fromIso: string): Check[] {
  const out: Check[] = [];
  const groups = new Map<string, Receipt[]>();
  for (const r of receipts) {
    if (r.deleted || r.date < fromIso) continue;
    // 带上收支方向：退款（收入）和原支出金额相同不算重复
    const key = [r.space, kindOf(r), r.date, r.totalCents, r.merchant.trim().toLowerCase()].join(
      '|',
    );
    groups.set(key, [...(groups.get(key) ?? []), r]);
    if (r.space !== 'company' || kindOf(r) !== 'expense') continue;
    if (r.gstCents === 0 && r.totalCents > 0 && USUALLY_GST.has(r.category))
      out.push({ id: `noGst:${r.id}`, kind: 'noGst', receiptIds: [r.id] });
    // IRD：超过 $1,000 的进项，发票上要有买方（你公司）的名称和一项联系方式
    if (r.gstCents > 0 && r.totalCents > 100_000)
      out.push({ id: `bigInvoice:${r.id}`, kind: 'bigInvoice', receiptIds: [r.id] });
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const ids = g.map((r) => r.id).sort();
    out.push({ id: `duplicate:${ids.join(',')}`, kind: 'duplicate', receiptIds: ids });
  }
  const order: CheckKind[] = ['duplicate', 'noGst', 'bigInvoice'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** 录入时就提醒：同一空间、同一收支、同一天、同金额、同一家商家已经记过一张（商家名忽略大小写和标点） */
export function findDuplicate(
  receipts: Receipt[],
  draft: { space: Space; kind: Kind; date: string; totalCents: number; merchant: string },
): Receipt | undefined {
  const key = merchantKey(draft.merchant);
  if (!key) return undefined;
  return receipts.find(
    (r) =>
      !r.deleted &&
      r.space === draft.space &&
      kindOf(r) === draft.kind &&
      r.date === draft.date &&
      r.totalCents === draft.totalCents &&
      merchantKey(r.merchant) === key,
  );
}
