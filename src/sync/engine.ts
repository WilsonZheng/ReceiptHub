import { db } from '../data/db';
import type { Receipt, Space } from '../data/types';
import { ConflictError, toBase64, type GithubClient } from './github';
import { mergeReceipts, monthPath } from './merge';

const MAX_ATTEMPTS = 5;
const shaKey = (path: string) => `sha:${path}`;

async function upsertToMonth(client: GithubClient, receipt: Receipt): Promise<void> {
  const path = monthPath(receipt.space, receipt.date);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 每轮都重新 GET：拿最新内容和 SHA，本地记录合并进去
    const remote = await client.getFile(path);
    const remoteRecs = remote ? (JSON.parse(remote.text) as Receipt[]) : [];
    const merged = mergeReceipts(remoteRecs, [receipt]);
    try {
      const newSha = await client.putFile(path, JSON.stringify(merged, null, 1), {
        sha: remote?.sha,
        message: `sync: ${receipt.merchant} ${receipt.date}`,
      });
      await db.kv.put({ key: shaKey(path), value: newSha });
      return;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      // SHA 冲突 → 下一轮重新 GET 合并
    }
  }
  throw new Error(`sha conflict persisted after ${MAX_ATTEMPTS} attempts: ${path}`);
}

export async function flushOutbox(client: GithubClient): Promise<void> {
  // 照片优先（month json 引用它们）
  const ops = await db.outbox.orderBy('seq').toArray();
  const photosFirst = [
    ...ops.filter((o) => o.kind === 'putPhoto'),
    ...ops.filter((o) => o.kind === 'upsertReceipt'),
  ];
  for (const op of photosFirst) {
    try {
      if (op.kind === 'putPhoto') {
        const photo = await db.photos.get(op.refId);
        if (photo) {
          const ext = photo.kind === 'pdf' ? 'pdf' : photo.kind;
          const path = `photos/${photo.receiptId}/${photo.id}.${ext}`;
          const existingSha = await client.getSha(path);
          if (!existingSha) {
            await client.putRaw(path, await toBase64(photo.full), {
              message: `photo: ${photo.id}`,
            });
          }
          await db.photos.update(op.refId, { synced: 1 });
        }
      } else {
        const receipt = await db.receipts.get(op.refId);
        if (receipt) await upsertToMonth(client, receipt);
      }
      await db.outbox.delete(op.seq!);
    } catch (e) {
      await db.outbox.update(op.seq!, {
        attempts: op.attempts + 1,
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e; // 调用方决定退避；剩余 ops 下轮再处理
    }
  }
}

export async function pullSpace(client: GithubClient, space: Space): Promise<void> {
  const entries = await client.listDir(space);
  for (const entry of entries) {
    const cached = (await db.kv.get(shaKey(entry.path)))?.value;
    if (cached === entry.sha) continue;
    const remote = await client.getFile(entry.path);
    if (!remote) continue;
    const remoteRecs = JSON.parse(remote.text) as Receipt[];
    const ids = remoteRecs.map((r) => r.id);
    const locals = (await db.receipts.bulkGet(ids)).filter((r): r is Receipt => !!r);
    const merged = mergeReceipts(remoteRecs, locals);
    await db.receipts.bulkPut(merged);
    await db.kv.put({ key: shaKey(entry.path), value: remote.sha });
  }
}

export async function pullAll(client: GithubClient): Promise<void> {
  await pullSpace(client, 'personal');
  await pullSpace(client, 'company');
}
