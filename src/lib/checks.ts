import { kindOf, type Receipt } from '../data/types';

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
    const key = [r.space, r.date, r.totalCents, r.merchant.trim().toLowerCase()].join('|');
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
