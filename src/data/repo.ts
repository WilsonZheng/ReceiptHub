import { ulid } from 'ulid';
import { db } from './db';
import type { PhotoKind, Receipt, Space } from './types';

export interface NewReceiptInput {
  space: Space;
  date: string;
  merchant: string;
  totalCents: number;
  gstCents: number;
  category: string;
  note?: string;
  files: { full: Blob; thumb?: Blob; kind: PhotoKind }[];
}

export async function saveReceipt(input: NewReceiptInput): Promise<Receipt> {
  const now = new Date().toISOString();
  const receipt: Receipt = {
    id: ulid(),
    space: input.space,
    date: input.date,
    merchant: input.merchant.trim(),
    totalCents: input.totalCents,
    gstCents: input.space === 'company' ? input.gstCents : 0,
    category: input.category,
    note: input.note?.trim() || undefined,
    photos: input.files.map((f) => ({ id: ulid(), kind: f.kind })),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', [db.receipts, db.photos, db.outbox], async () => {
    await db.receipts.add(receipt);
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i];
      await db.photos.add({
        id: receipt.photos[i].id,
        receiptId: receipt.id,
        kind: f.kind,
        full: f.full,
        thumb: f.thumb,
        synced: 0,
      });
      await db.outbox.add({ kind: 'putPhoto', refId: receipt.photos[i].id, attempts: 0 });
    }
    await db.outbox.add({ kind: 'upsertReceipt', refId: receipt.id, attempts: 0 });
  });
  return receipt;
}

export async function updateReceipt(
  id: string,
  patch: Partial<Omit<Receipt, 'id' | 'createdAt'>>,
): Promise<Receipt> {
  const existing = await db.receipts.get(id);
  if (!existing) throw new Error(`receipt ${id} not found`);
  const updated: Receipt = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.transaction('rw', [db.receipts, db.outbox], async () => {
    await db.receipts.put(updated);
    await db.outbox.add({ kind: 'upsertReceipt', refId: id, attempts: 0 });
  });
  return updated;
}

export async function softDeleteReceipt(id: string): Promise<void> {
  await updateReceipt(id, { deleted: true });
}

export async function listReceipts(space: Space | 'all'): Promise<Receipt[]> {
  const all =
    space === 'all'
      ? await db.receipts.toArray()
      : await db.receipts.where('space').equals(space).toArray();
  return all.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1));
}
