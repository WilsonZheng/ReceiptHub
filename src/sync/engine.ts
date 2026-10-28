import { db } from '../data/db';
import type { PhotoRef, Receipt, Space } from '../data/types';
import type { PhotoRow } from '../data/db';
import { AuthError, ConflictError, toBase64, type GithubClient } from './github';
import { mergeReceipts, monthPath } from './merge';

const MAX_ATTEMPTS = 5;
const shaKey = (path: string) => `sha:${path}`;

/**
 * 把某个月份文件的内容并进本地（LWW），再记下它的 SHA——两步必须一起做：
 * 只记 SHA 不并内容，下次拉取会以为"没变"而跳过，别的设备写进这个月的记录就永远下不来。
 * 读-合并-写在同一个事务里，避免和用户同时保存的修改互相覆盖。
 */
async function absorbMonth(path: string, sha: string, remoteRecs: Receipt[]): Promise<void> {
  await db.transaction('rw', [db.receipts, db.kv], async () => {
    const locals = (await db.receipts.bulkGet(remoteRecs.map((r) => r.id))).filter(
      (r): r is Receipt => !!r,
    );
    await db.receipts.bulkPut(mergeReceipts(remoteRecs, locals));
    await db.kv.put({ key: shaKey(path), value: sha });
  });
}

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
      await absorbMonth(path, newSha, merged);
      return;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      // SHA 冲突 → 下一轮重新 GET 合并
    }
  }
  throw new Error(`sha conflict persisted after ${MAX_ATTEMPTS} attempts: ${path}`);
}

/** 改日期跨月后，从旧月份文件删掉这条记录——只删比本地旧的那份（别的设备改回来的更新版本要留着） */
async function dropFromMonth(client: GithubClient, path: string, receipt: Receipt): Promise<void> {
  if (monthPath(receipt.space, receipt.date) === path) return; // 又改回了这个月
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await client.getFile(path);
    if (!remote) return;
    const recs = JSON.parse(remote.text) as Receipt[];
    const kept = recs.filter((r) => r.id !== receipt.id || r.updatedAt > receipt.updatedAt);
    if (kept.length === recs.length) return;
    try {
      const newSha = await client.putFile(path, JSON.stringify(kept, null, 1), {
        sha: remote.sha,
        message: `sync: move ${receipt.merchant} out of ${path}`,
      });
      await absorbMonth(path, newSha, kept);
      return;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new Error(`sha conflict persisted after ${MAX_ATTEMPTS} attempts: ${path}`);
}

export async function flushOutbox(client: GithubClient): Promise<void> {
  // 照片优先（month json 引用它们）；从旧月份删放最后，新月份先写好
  const ops = await db.outbox.orderBy('seq').toArray();
  const photosFirst = [
    ...ops.filter((o) => o.kind === 'putPhoto'),
    ...ops.filter((o) => o.kind === 'upsertReceipt'),
    ...ops.filter((o) => o.kind === 'dropFromMonth'),
  ];
  // 一条失败不拖住别的：记下错误继续；只有照片没传上去的那张票据，先不写它的月份记录
  let firstError: unknown = null;
  const photoFailed = new Set<string>();
  for (const op of photosFirst) {
    try {
      if (op.kind === 'putPhoto') {
        const photo = await db.photos.get(op.refId);
        const owner = photo && (await db.receipts.get(photo.receiptId));
        if (photo && owner && !owner.deleted) {
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
      } else if (op.kind === 'dropFromMonth') {
        const receipt = await db.receipts.get(op.refId);
        if (receipt && op.path) await dropFromMonth(client, op.path, receipt);
      } else {
        if (photoFailed.has(op.refId)) continue;
        const receipt = await db.receipts.get(op.refId);
        if (receipt) await upsertToMonth(client, receipt);
      }
      await db.outbox.delete(op.seq!);
    } catch (e) {
      await db.outbox.update(op.seq!, {
        attempts: op.attempts + 1,
        lastError: e instanceof Error ? e.message : String(e),
      });
      if (e instanceof AuthError) throw e; // 凭证失效：后面的也必然失败
      if (op.kind === 'putPhoto') {
        const photo = await db.photos.get(op.refId);
        if (photo) photoFailed.add(photo.receiptId);
      }
      firstError ??= e;
    }
  }
  if (firstError) throw firstError; // 剩下的下轮再试；调用方显示同步出错
}

export async function pullSpace(client: GithubClient, space: Space): Promise<void> {
  const entries = await client.listDir(space);
  for (const entry of entries) {
    const cached = (await db.kv.get(shaKey(entry.path)))?.value;
    if (cached === entry.sha) continue;
    const remote = await client.getFile(entry.path);
    if (!remote) continue;
    await absorbMonth(entry.path, remote.sha, JSON.parse(remote.text) as Receipt[]);
  }
}

export async function pullAll(client: GithubClient): Promise<void> {
  await pullSpace(client, 'personal');
  await pullSpace(client, 'company');
}

const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', pdf: 'application/pdf' } as const;

/** 别的设备拍的照片：本机第一次打开详情时从云端下载，存下来以后就不用再下 */
export async function downloadPhoto(
  client: GithubClient,
  receiptId: string,
  ref: PhotoRef,
): Promise<PhotoRow | null> {
  const blob = await client.getBlob(`photos/${receiptId}/${ref.id}.${ref.kind}`);
  if (!blob) return null;
  const row: PhotoRow = {
    id: ref.id,
    receiptId,
    kind: ref.kind,
    full: new Blob([blob], { type: MIME[ref.kind] }),
    synced: 1,
  };
  await db.photos.put(row);
  return row;
}
