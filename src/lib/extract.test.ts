import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractReceipt, ExtractError } from './extract';

afterEach(() => vi.restoreAllMocks());

const CATS = { expense: ['Fuel', 'Equipment', 'Other'], income: ['Sales', 'Other'] };
const OPTS = { apiKey: 'k', categories: CATS, locale: 'en' as const };
const file = { blob: new Blob(['x'], { type: 'image/webp' }), kind: 'webp' as const };

const geminiReply = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
    { status: 200 },
  );

describe('extractReceipt', () => {
  it('maps gemini json to form fields (dollars → cents), incl note', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({
        merchant: 'Bunnings Warehouse',
        date: '2026-06-05',
        total: 184.5,
        kind: 'expense',
        category: 'Equipment',
        items: ['Pine timber 2.4m ×6', 'Screws box'],
        note: 'inv #INV-1042 · EFTPOS',
      }),
    );
    const r = await extractReceipt([file], OPTS);
    expect(r).toEqual({
      merchant: 'Bunnings Warehouse',
      date: '2026-06-05',
      totalCents: 18450,
      kind: 'expense',
      category: 'Equipment',
      items: ['Pine timber 2.4m ×6', 'Screws box'],
      note: 'inv #INV-1042 · EFTPOS',
    });
  });

  it('caps items list and drops junk entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ items: ['  ok  ', '', 3, ...Array(20).fill('x')] }),
    );
    const r = await extractReceipt([file], OPTS);
    expect(r.items?.[0]).toBe('ok');
    expect(r.items?.length).toBeLessThanOrEqual(12);
  });

  it('truncates absurdly long notes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({ note: 'x'.repeat(500) }));
    const r = await extractReceipt([file], OPTS);
    expect(r.note).toHaveLength(200);
  });

  it('prompt asks for note in app language', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    await extractReceipt([file], { ...OPTS, locale: 'zh' });
    expect(String(spy.mock.calls[0][1]?.body)).toContain('Chinese');
  });

  it('sends inline data + json schema to gemini', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    await extractReceipt([file], { ...OPTS, apiKey: 'secret-key' });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('generativelanguage.googleapis.com');
    expect(String(url)).not.toContain('secret-key'); // key 走 header 不进 URL
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/webp');
    expect(body.generationConfig.response_mime_type).toBe('application/json');
    expect(JSON.stringify(body)).toContain('Fuel'); // 分类列表进了提示词
  });

  it('drops category not in the allowed list and invalid date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ merchant: 'X', date: 'last tuesday', total: 10, category: 'Made Up' }),
    );
    const r = await extractReceipt([file], OPTS);
    expect(r.category).toBeUndefined();
    expect(r.date).toBeUndefined();
    expect(r.totalCents).toBe(1000);
  });

  it('income kind validates category against income list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ kind: 'income', category: 'Sales', total: 230 }),
    );
    const r = await extractReceipt([file], OPTS);
    expect(r.kind).toBe('income');
    expect(r.category).toBe('Sales');
  });

  it('pdf uses application/pdf mime', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    await extractReceipt(
      [{ blob: new Blob(['p'], { type: 'application/pdf' }), kind: 'pdf' }],
      OPTS,
    );
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('application/pdf');
  });

  it('multiple photos of the same receipt merge into one request, capped at 4', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    const f = (n: string) => ({
      blob: new Blob([n], { type: 'image/webp' }),
      kind: 'webp' as const,
    });
    await extractReceipt([f('a'), f('b'), f('c'), f('d'), f('e'), f('f')], OPTS);
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    const inlines = body.contents[0].parts.filter((p: { inline_data?: unknown }) => p.inline_data);
    expect(inlines).toHaveLength(4); // 上限 4，防 payload 过大
    expect(JSON.stringify(body)).toContain('SAME'); // 提示词声明多图属同一票据
  });

  it('throws typed error on 429 rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(extractReceipt([file], OPTS)).rejects.toMatchObject({
      name: 'ExtractError',
      reason: 'rate_limit',
    });
    expect(new ExtractError('rate_limit').reason).toBe('rate_limit');
  });

  it('throws typed error on bad key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(extractReceipt([file], { ...OPTS, apiKey: 'bad' })).rejects.toMatchObject({
      reason: 'auth',
    });
  });
});
