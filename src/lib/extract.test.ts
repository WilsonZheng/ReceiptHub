import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractReceipt, ExtractError } from './extract';

afterEach(() => vi.restoreAllMocks());

const CATS = { expense: ['Fuel', 'Equipment', 'Other'], income: ['Sales', 'Other'] };
const file = { blob: new Blob(['x'], { type: 'image/webp' }), kind: 'webp' as const };

const geminiReply = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
    { status: 200 },
  );

describe('extractReceipt', () => {
  it('maps gemini json to form fields (dollars → cents)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({
        merchant: 'Bunnings Warehouse',
        date: '2026-06-05',
        total: 184.5,
        kind: 'expense',
        category: 'Equipment',
      }),
    );
    const r = await extractReceipt(file, { apiKey: 'k', categories: CATS });
    expect(r).toEqual({
      merchant: 'Bunnings Warehouse',
      date: '2026-06-05',
      totalCents: 18450,
      kind: 'expense',
      category: 'Equipment',
    });
  });

  it('sends inline data + json schema to gemini', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    await extractReceipt(file, { apiKey: 'secret-key', categories: CATS });
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
    const r = await extractReceipt(file, { apiKey: 'k', categories: CATS });
    expect(r.category).toBeUndefined();
    expect(r.date).toBeUndefined();
    expect(r.totalCents).toBe(1000);
  });

  it('income kind validates category against income list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ kind: 'income', category: 'Sales', total: 230 }),
    );
    const r = await extractReceipt(file, { apiKey: 'k', categories: CATS });
    expect(r.kind).toBe('income');
    expect(r.category).toBe('Sales');
  });

  it('pdf uses application/pdf mime', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(geminiReply({}));
    await extractReceipt(
      { blob: new Blob(['p'], { type: 'application/pdf' }), kind: 'pdf' },
      { apiKey: 'k', categories: CATS },
    );
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('application/pdf');
  });

  it('throws typed error on 429 rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(extractReceipt(file, { apiKey: 'k', categories: CATS })).rejects.toMatchObject({
      name: 'ExtractError',
      reason: 'rate_limit',
    });
    expect(new ExtractError('rate_limit').reason).toBe('rate_limit');
  });

  it('throws typed error on bad key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(extractReceipt(file, { apiKey: 'bad', categories: CATS })).rejects.toMatchObject({
      reason: 'auth',
    });
  });
});
