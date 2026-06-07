import Dexie, { type EntityTable } from 'dexie';
import type { PhotoKind, Receipt } from './types';

export interface PhotoRow {
  id: string;
  receiptId: string;
  kind: PhotoKind;
  full: Blob;
  thumb?: Blob; // pdf 无缩略图
  synced: 0 | 1;
}

export interface OutboxRow {
  seq?: number;
  kind: 'upsertReceipt' | 'putPhoto';
  refId: string; // receiptId 或 photoId
  attempts: number;
  lastError?: string;
}

export interface KvRow {
  key: string; // e.g. 'sha:personal/2026-06.json'
  value: string;
}

export const db = new Dexie('receipthub') as Dexie & {
  receipts: EntityTable<Receipt, 'id'>;
  photos: EntityTable<PhotoRow, 'id'>;
  outbox: EntityTable<OutboxRow, 'seq'>;
  kv: EntityTable<KvRow, 'key'>;
};

db.version(1).stores({
  receipts: 'id, space, date, updatedAt',
  photos: 'id, receiptId, synced',
  outbox: '++seq, kind, refId',
  kv: 'key',
});
