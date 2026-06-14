import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { saveReceipt } from '../data/repo';
import { ConflictError, type GithubClient } from './github';
import { flushOutbox, pullSpace } from './engine';

beforeEach(async () => {
  await Promise.all([db.receipts.clear(), db.photos.clear(), db.outbox.clear(), db.kv.clear()]);
});

const input = {
  space: 'company' as const,
  kind: 'expense' as const,
  date: '2026-06-07',
  merchant: 'Bunnings',
  totalCents: 18450,
  gstCents: 2407,
  category: 'Equipment',
  files: [{ full: new Blob(['x']), kind: 'webp' as const }],
};

function fakeClient(remote: Map<string, { text: string; sha: number }>) {
  return {
    getFile: vi.fn(async (p: string) => {
      const f = remote.get(p);
      return f ? { text: f.text, sha: String(f.sha) } : null;
    }),
    putFile: vi.fn(async (p: string, text: string, o: { sha?: string }) => {
      const cur = remote.get(p);
      if (cur && o.sha !== String(cur.sha)) throw new ConflictError('sha');
      const sha = (cur?.sha ?? 0) + 1;
      remote.set(p, { text, sha });
      return String(sha);
    }),
    putRaw: vi.fn(async () => 'photosha'),
    getSha: vi.fn(async (p: string) => {
      const f = remote.get(p);
      return f ? String(f.sha) : null;
    }),
    listDir: vi.fn(async (p: string) =>
      [...remote.keys()]
        .filter((k) => k.startsWith(p + '/'))
        .map((k) => ({ path: k, sha: String(remote.get(k)!.sha) })),
    ),
  } as unknown as GithubClient;
}

describe('flushOutbox', () => {
  it('uploads photo then month json, clears outbox, marks photo synced', async () => {
    const remote = new Map<string, { text: string; sha: number }>();
    await saveReceipt(input);
    await flushOutbox(fakeClient(remote));
    expect(await db.outbox.count()).toBe(0);
    expect((await db.photos.toArray())[0].synced).toBe(1);
    const month = remote.get('company/2026-06.json');
    expect(month).toBeDefined();
    expect(JSON.parse(month!.text)).toHaveLength(1);
  });

  it('overcomes stale remote state via conflict retry', async () => {
    const remote = new Map([['company/2026-06.json', { text: '[]', sha: 5 }]]);
    await saveReceipt({ ...input, files: [] });
    const client = fakeClient(remote);
    // 第一次 PUT 故意冲突：getFile 返回过期 sha
    const realGet = client.getFile as ReturnType<typeof vi.fn>;
    const original = realGet.getMockImplementation() as (
      p: string,
    ) => Promise<{ text: string; sha: string } | null>;
    realGet.mockImplementationOnce(async (p: string) => {
      const r = await original(p);
      return r ? { ...r, sha: '3' } : null; // 错误的 sha → ConflictError → 重试
    });
    await flushOutbox(client);
    expect(JSON.parse(remote.get('company/2026-06.json')!.text)).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps op in outbox with attempts++ when push fails', async () => {
    await saveReceipt({ ...input, files: [] });
    const client = fakeClient(new Map());
    (client.putFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    await expect(flushOutbox(client)).rejects.toThrow('network down');
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].attempts).toBe(1);
    expect(ops[0].lastError).toContain('network down');
  });

  it('treats an already uploaded photo as synced when retrying a stale outbox op', async () => {
    const remote = new Map<string, { text: string; sha: number }>();
    const receipt = await saveReceipt(input);
    const photo = (await db.photos.toArray())[0];
    remote.set(`photos/${receipt.id}/${photo.id}.webp`, { text: 'already uploaded', sha: 1 });
    const client = fakeClient(remote);
    (client.putRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new ConflictError('exists'));

    await flushOutbox(client);

    expect(client.putRaw).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.photos.get(photo.id))?.synced).toBe(1);
    expect(JSON.parse(remote.get('company/2026-06.json')!.text)).toHaveLength(1);
  });
});

describe('pullSpace', () => {
  it('fetches changed months and merges into local', async () => {
    const remoteRec = {
      id: '01HREMOTE0000000000000000A',
      space: 'company',
      date: '2026-06-03',
      merchant: 'Remote',
      totalCents: 100,
      gstCents: 13,
      category: 'Other',
      photos: [],
      createdAt: '2026-06-03T00:00:00Z',
      updatedAt: '2026-06-03T00:00:00Z',
    };
    const remote = new Map([
      ['company/2026-06.json', { text: JSON.stringify([remoteRec]), sha: 1 }],
    ]);
    await pullSpace(fakeClient(remote), 'company');
    expect(await db.receipts.count()).toBe(1);
    expect((await db.kv.get('sha:company/2026-06.json'))?.value).toBe('1');
  });

  it('skips months whose sha is unchanged', async () => {
    const remote = new Map([['company/2026-06.json', { text: '[]', sha: 7 }]]);
    await db.kv.put({ key: 'sha:company/2026-06.json', value: '7' });
    const c = fakeClient(remote);
    await pullSpace(c, 'company');
    expect(c.getFile).not.toHaveBeenCalled();
  });

  it('local newer edit survives pull (LWW)', async () => {
    const rec = await saveReceipt({ ...input, files: [] });
    const staleRemote = { ...rec, merchant: 'STALE', updatedAt: '2020-01-01T00:00:00Z' };
    const remote = new Map([
      ['company/2026-06.json', { text: JSON.stringify([staleRemote]), sha: 1 }],
    ]);
    await pullSpace(fakeClient(remote), 'company');
    expect((await db.receipts.get(rec.id))?.merchant).toBe('Bunnings');
  });
});
