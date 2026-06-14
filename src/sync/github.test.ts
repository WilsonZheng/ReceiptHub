import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClient, toBase64 } from './github';

const client = () => new GithubClient('tok', 'WilsonZheng/ReceiptHub-data');
afterEach(() => vi.restoreAllMocks());

const mockFetch = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('toBase64', () => {
  it('handles unicode', async () => {
    expect(await toBase64(new Blob(['票据 $1,299']))).toBe(
      btoa(unescape(encodeURIComponent('票据 $1,299'))),
    );
  });
});

describe('getFile', () => {
  it('decodes content and returns sha', async () => {
    mockFetch(200, { content: btoa('[]'), sha: 'abc' });
    expect(await client().getFile('company/2026-06.json')).toEqual({ text: '[]', sha: 'abc' });
  });
  it('returns null on 404', async () => {
    mockFetch(404, { message: 'Not Found' });
    expect(await client().getFile('nope.json')).toBeNull();
  });
  it('throws AuthError on 401', async () => {
    mockFetch(401, { message: 'Bad credentials' });
    await expect(client().getFile('x')).rejects.toMatchObject({ name: 'AuthError' });
  });
});

describe('getSha', () => {
  it('returns only the sha for an existing path', async () => {
    mockFetch(200, { content: '', sha: 'photosha' });
    expect(await client().getSha('photos/r/p.webp')).toBe('photosha');
  });
  it('returns null on 404', async () => {
    mockFetch(404, { message: 'Not Found' });
    expect(await client().getSha('missing.webp')).toBeNull();
  });
});

describe('putFile', () => {
  it('PUTs base64 content with sha and returns new sha', async () => {
    const spy = mockFetch(200, { content: { sha: 'new' } });
    const sha = await client().putFile('company/2026-06.json', '[]', { sha: 'old', message: 'm' });
    expect(sha).toBe('new');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain(
      '/repos/WilsonZheng/ReceiptHub-data/contents/company/2026-06.json',
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({ sha: 'old', content: btoa('[]') });
  });
  it('throws ConflictError on 409/422 sha mismatch', async () => {
    mockFetch(409, { message: 'conflict' });
    await expect(client().putFile('p', 'c', { message: 'm' })).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});

describe('listDir', () => {
  it('maps entries to path+sha', async () => {
    mockFetch(200, [{ path: 'company/2026-06.json', sha: 's1', type: 'file' }]);
    expect(await client().listDir('company')).toEqual([
      { path: 'company/2026-06.json', sha: 's1' },
    ]);
  });
  it('empty on 404 (dir not created yet)', async () => {
    mockFetch(404, { message: 'Not Found' });
    expect(await client().listDir('personal')).toEqual([]);
  });
});
