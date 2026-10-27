import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { attachFiles, listReceipts, saveReceipt, softDeleteReceipt, updateReceipt } from './repo';

beforeEach(async () => {
  await db.receipts.clear();
  await db.photos.clear();
  await db.outbox.clear();
});

const input = {
  space: 'company' as const,
  kind: 'expense' as const,
  date: '2026-06-07',
  merchant: 'Bunnings',
  totalCents: 18450,
  gstCents: 2407,
  category: 'Equipment',
  note: '',
  files: [{ full: new Blob(['x']), thumb: new Blob(['t']), kind: 'webp' as const }],
};

describe('saveReceipt', () => {
  it('writes receipt + photo rows + outbox entries atomically', async () => {
    const rec = await saveReceipt(input);
    expect(rec.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(await db.receipts.count()).toBe(1);
    expect(await db.photos.count()).toBe(1);
    const ops = await db.outbox.toArray();
    expect(ops.map((o) => o.kind).sort()).toEqual(['putPhoto', 'upsertReceipt']);
  });
});

describe('saveReceipt without files', () => {
  it('saves a record with no original receipt and only queues the record upsert', async () => {
    const rec = await saveReceipt({ ...input, files: [] });
    expect(rec.photos).toEqual([]);
    expect(await db.photos.count()).toBe(0);
    expect((await db.outbox.toArray()).map((o) => o.kind)).toEqual(['upsertReceipt']);
  });
});

describe('attachFiles', () => {
  it('adds photo rows to an existing record and queues photos before the record', async () => {
    const rec = await saveReceipt({ ...input, files: [] });
    await db.outbox.clear();
    await new Promise((r) => setTimeout(r, 2));
    const updated = await attachFiles(rec.id, [{ full: new Blob(['p']), kind: 'pdf' }]);
    expect(updated.photos).toHaveLength(1);
    expect(updated.photos[0].kind).toBe('pdf');
    expect(updated.updatedAt > rec.updatedAt).toBe(true);
    const photo = await db.photos.get(updated.photos[0].id);
    expect(photo).toMatchObject({ receiptId: rec.id, kind: 'pdf', synced: 0 });
    const ops = await db.outbox.toArray();
    expect(ops.map((o) => o.kind)).toEqual(['putPhoto', 'upsertReceipt']);
  });

  it('keeps photos that were already attached', async () => {
    const rec = await saveReceipt(input);
    const updated = await attachFiles(rec.id, [{ full: new Blob(['p2']), kind: 'jpeg' }]);
    expect(updated.photos.map((p) => p.kind)).toEqual(['webp', 'jpeg']);
    expect(await db.photos.where('receiptId').equals(rec.id).count()).toBe(2);
  });
});

describe('updateReceipt', () => {
  it('bumps updatedAt and enqueues upsert', async () => {
    const rec = await saveReceipt(input);
    await db.outbox.clear();
    await new Promise((r) => setTimeout(r, 2)); // 保证 updatedAt 时间戳前进
    const updated = await updateReceipt(rec.id, { merchant: 'Z Energy' });
    expect(updated.merchant).toBe('Z Energy');
    expect(updated.updatedAt > rec.updatedAt).toBe(true);
    expect((await db.outbox.toArray())[0].kind).toBe('upsertReceipt');
  });
});

describe('softDeleteReceipt / listReceipts', () => {
  it('tombstones hide from list but stay in table', async () => {
    const rec = await saveReceipt(input);
    await softDeleteReceipt(rec.id);
    expect(await listReceipts('all')).toHaveLength(0);
    expect((await db.receipts.get(rec.id))?.deleted).toBe(true);
  });
  it('filters by space, sorted date desc', async () => {
    await saveReceipt({ ...input, date: '2026-06-01' });
    await saveReceipt({ ...input, space: 'personal', gstCents: 0, date: '2026-06-05' });
    expect((await listReceipts('company')).map((r) => r.space)).toEqual(['company']);
    expect((await listReceipts('all'))[0].date).toBe('2026-06-05');
  });
});
