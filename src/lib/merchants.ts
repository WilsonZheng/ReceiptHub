import { kindOf, type Kind, type Receipt, type Space } from '../data/types';

// 比较商家名时忽略大小写、空格和标点："FASTBOLT LIMITED" 和 "Fastbolt Limited" 是同一家
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** 以前记过的同一家商家：返回当时的写法，让列表和搜索里同一家只有一种拼法 */
export function knownMerchantSpelling(name: string, history: Receipt[]): string | undefined {
  const key = merchantKey(name);
  if (!key) return undefined;
  return history.find((r) => !r.deleted && merchantKey(r.merchant) === key)?.merchant;
}

/** 同一空间、同一收支类型里，这家商家最近一次用的分类（history 按时间倒序） */
export function lastCategoryFor(
  name: string,
  space: Space,
  kind: Kind,
  history: Receipt[],
): string | undefined {
  const key = merchantKey(name);
  if (!key) return undefined;
  return history.find(
    (r) =>
      !r.deleted &&
      r.space === space &&
      kindOf(r) === kind &&
      r.category &&
      merchantKey(r.merchant) === key,
  )?.category;
}
