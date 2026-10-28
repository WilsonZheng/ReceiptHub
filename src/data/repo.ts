import { ulid } from 'ulid';
import { db } from './db';
import { monthPath } from '../sync/merge';
import type { Kind, PhotoKind, PhotoRef, Receipt, Space } from './types';

export interface NewReceiptInput {
  space: Space;
  kind: Kind;
  date: string;
  merchant: string;
  totalCents: number;
  gstCents: number;
  category: string;
  note?: string;
  items?: string[];
  files: { full: Blob; thumb?: Blob; kind: PhotoKind }[];
}

export async function saveReceipt(input: NewReceiptInput): Promise<Receipt> {
  const now = new Date().toISOString();
  const receipt: Receipt = {
    id: ulid(),
    space: input.space,
    kind: input.kind,
    date: input.date,
    merchant: input.merchant.trim(),
    totalCents: input.totalCents,
    gstCents: input.space === 'company' ? input.gstCents : 0,
    category: input.category,
    note: input.note?.trim() || undefined,
    items: input.items?.length ? input.items : undefined,
    photos: input.files.map((f) => ({ id: ulid(), kind: f.kind })),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', [db.receipts, db.photos, db.outbox], async () => {
    await db.receipts.add(receipt);
    await addPhotoRows(receipt.id, receipt.photos, input.files);
    await db.outbox.add({ kind: 'upsertReceipt', refId: receipt.id, attempts: 0 });
  });
  return receipt;
}

type NewFile = NewReceiptInput['files'][number];

async function addPhotoRows(receiptId: string, refs: PhotoRef[], files: NewFile[]) {
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await db.photos.add({
      id: refs[i].id,
      receiptId,
      kind: f.kind,
      full: f.full,
      thumb: f.thumb,
      synced: 0,
    });
    await db.outbox.add({ kind: 'putPhoto', refId: refs[i].id, attempts: 0 });
  }
}

/** 给已有记录补上原始票据（照片/PDF）：照片先进 outbox，月度 json 再引用它们 */
export async function attachFiles(id: string, files: NewFile[]): Promise<Receipt> {
  const existing = await db.receipts.get(id);
  if (!existing) throw new Error(`receipt ${id} not found`);
  const refs = files.map((f) => ({ id: ulid(), kind: f.kind }));
  const updated: Receipt = {
    ...existing,
    photos: [...existing.photos, ...refs],
    updatedAt: new Date().toISOString(),
  };
  await db.transaction('rw', [db.receipts, db.photos, db.outbox], async () => {
    await addPhotoRows(id, refs, files);
    await db.receipts.put(updated);
    await db.outbox.add({ kind: 'upsertReceipt', refId: id, attempts: 0 });
  });
  return updated;
}

export async function updateReceipt(
  id: string,
  patch: Partial<Omit<Receipt, 'id' | 'createdAt'>>,
): Promise<Receipt> {
  const existing = await db.receipts.get(id);
  if (!existing) throw new Error(`receipt ${id} not found`);
  const updated: Receipt = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  const oldPath = monthPath(existing.space, existing.date);
  await db.transaction('rw', [db.receipts, db.outbox], async () => {
    await db.receipts.put(updated);
    await db.outbox.add({ kind: 'upsertReceipt', refId: id, attempts: 0 });
    // 改日期跨了月：旧月份文件里那份要删掉，不然会留下一份旧副本
    if (monthPath(updated.space, updated.date) !== oldPath)
      await db.outbox.add({ kind: 'dropFromMonth', refId: id, path: oldPath, attempts: 0 });
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
