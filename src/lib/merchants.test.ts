import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { knownMerchantSpelling, lastCategoryFor, merchantKey } from './merchants';

const rec = (merchant: string, extra: Partial<Receipt> = {}): Receipt => ({
  id: merchant,
  space: 'company',
  kind: 'expense',
  date: '2026-10-01',
  merchant,
  totalCents: 1000,
  gstCents: 130,
  category: 'Other',
  photos: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('merchants', () => {
  it('treats case, spaces and punctuation as the same merchant', () => {
    expect(merchantKey('FASTBOLT LIMITED')).toBe(merchantKey('Fastbolt Limited'));
    expect(merchantKey("PAK'nSAVE")).toBe(merchantKey('Paknsave'));
    expect(merchantKey('Sum Made 心美')).not.toBe(merchantKey('Sum Made'));
  });

  it('reuses the spelling you used before, ignoring deleted records', () => {
    const history = [rec('Old Name Ltd', { deleted: true }), rec('Mitre 10')];
    expect(knownMerchantSpelling('MITRE 10', history)).toBe('Mitre 10');
    expect(knownMerchantSpelling('old name ltd', history)).toBeUndefined();
    expect(knownMerchantSpelling('  ', history)).toBeUndefined();
  });

  it('suggests the category last used for this merchant in the same space and kind', () => {
    const history = [
      rec('Mitre 10', { space: 'personal', category: 'Tools' }),
      rec('Mitre 10', { category: 'Repairs' }),
      rec('Mitre 10', { category: 'Equipment' }),
      rec('Clyma', { kind: 'income', category: 'Services' }),
    ];
    expect(lastCategoryFor('mitre 10', 'company', 'expense', history)).toBe('Repairs');
    expect(lastCategoryFor('Mitre 10', 'personal', 'expense', history)).toBe('Tools');
    expect(lastCategoryFor('Clyma', 'company', 'expense', history)).toBeUndefined();
  });
});
