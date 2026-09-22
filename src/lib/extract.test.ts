import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractReceipt, ExtractError } from './extract';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const CATS = { expense: ['Fuel', 'Equipment', 'Other'], income: ['Sales', 'Other'] };
const GEMINI_OPTS = {
  apiKey: 'k',
  provider: 'gemini' as const,
  categories: CATS,
  locale: 'en' as const,
};
const MISTRAL_OPTS = { ...GEMINI_OPTS, provider: 'mistral' as const };
const file = { blob: new Blob(['x'], { type: 'image/webp' }), kind: 'webp' as const };

const geminiReply = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
    { status: 200 },
  );

const mistralReply = (obj: unknown) =>
  new Response(JSON.stringify({ document_annotation: JSON.stringify(obj), pages: [] }), {
    status: 200,
  });

describe('extractReceipt', () => {
  it('maps Gemini JSON to form fields (dollars → cents), incl note', async () => {
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
    const r = await extractReceipt([file], GEMINI_OPTS);
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

  it('maps Mistral document annotation to the same form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mistralReply({
        merchant: 'Z Energy',
        date: '2026-08-20',
        total: '92.30',
        kind: 'expense',
        category: 'fuel',
        items: ['Unleaded 91 ×42.5L'],
        note: 'EFTPOS',
      }),
    );
    await expect(extractReceipt([file], MISTRAL_OPTS)).resolves.toEqual({
      merchant: 'Z Energy',
      date: '2026-08-20',
      totalCents: 9230,
      kind: 'expense',
      category: 'Fuel',
      items: ['Unleaded 91 ×42.5L'],
      note: 'EFTPOS',
    });
  });

  it('sends a base64 image, strict schema and bearer key to stable Mistral OCR', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mistralReply({ merchant: 'Test Store' }));

    await extractReceipt([file], { ...MISTRAL_OPTS, apiKey: 'secret-key' });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/ocr');
    expect(String(url)).not.toContain('secret-key');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('mistral-ocr-4-0');
    expect(body.document).toMatchObject({ type: 'image_url' });
    expect(body.document.image_url).toMatch(/^data:image\/webp;base64,/);
    expect(body.document_annotation_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'receipt_extraction', strict: true },
    });
    expect(body.document_annotation_format.json_schema.schema.properties.total).toMatchObject({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(body.include_blocks).toBe(false);
    expect(JSON.stringify(body)).toContain('Fuel');
  });

  it('uses document_url for PDFs sent to Mistral', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mistralReply({ merchant: 'PDF Supplier' }));
    await extractReceipt(
      [{ blob: new Blob(['p'], { type: 'application/pdf' }), kind: 'pdf' }],
      MISTRAL_OPTS,
    );
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.document.type).toBe('document_url');
    expect(body.document.document_url).toMatch(/^data:application\/pdf;base64,/);
  });

  it('merges Mistral multi-photo fields sequentially and caps input at four', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mistralReply({
          merchant: 'Multi Page Co',
          date: '2026-08-21',
          kind: 'expense',
          category: 'Equipment',
          items: ['Timber'],
          note: 'Invoice 42',
        }),
      )
      .mockResolvedValueOnce(mistralReply({ items: ['Timber', 'Screws'], total: 115 }))
      .mockResolvedValueOnce(mistralReply({ items: ['Delivery'] }))
      .mockResolvedValueOnce(mistralReply({ total: 120, note: 'EFTPOS' }));
    const files = Array.from({ length: 6 }, (_, i) => ({
      blob: new Blob([String(i)], { type: 'image/webp' }),
      kind: 'webp' as const,
    }));

    await expect(extractReceipt(files, MISTRAL_OPTS)).resolves.toEqual({
      merchant: 'Multi Page Co',
      date: '2026-08-21',
      totalCents: 12000,
      kind: 'expense',
      category: 'Equipment',
      items: ['Timber', 'Screws', 'Delivery'],
      note: 'Invoice 42 · EFTPOS',
    });
    expect(spy).toHaveBeenCalledTimes(4);
    const secondBody = JSON.parse(String(spy.mock.calls[1][1]?.body));
    expect(secondBody.document_annotation_prompt).toContain('page/photo 2 of 4');
  });

  it('caps items list, drops junk entries and truncates notes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ items: ['  ok  ', '', 3, ...Array(20).fill('x')], note: 'n'.repeat(500) }),
    );
    const r = await extractReceipt([file], GEMINI_OPTS);
    expect(r.items?.[0]).toBe('ok');
    expect(r.items?.length).toBeLessThanOrEqual(12);
    expect(r.note).toHaveLength(200);
  });

  it('asks for notes in the app language', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mistralReply({ merchant: '中文商店' }));
    await extractReceipt([file], { ...MISTRAL_OPTS, locale: 'zh' });
    expect(String(spy.mock.calls[0][1]?.body)).toContain('Chinese');
  });

  it('sends inline data + JSON schema to Gemini without putting the key in the URL', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(geminiReply({ merchant: 'Test Store' }));
    await extractReceipt([file], { ...GEMINI_OPTS, apiKey: 'secret-key' });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('generativelanguage.googleapis.com');
    expect(String(url)).not.toContain('secret-key');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/webp');
    expect(body.generationConfig.response_mime_type).toBe('application/json');
    expect(JSON.stringify(body)).toContain('Fuel');
  });

  it('retries a transient browser network failure before showing an error', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(geminiReply({ merchant: 'Retry Cafe', total: 12.5 }));
    const pending = extractReceipt([file], GEMINI_OPTS);
    await vi.runAllTimersAsync();
    const r = await pending;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ merchant: 'Retry Cafe', totalCents: 1250 });
  });

  it('retries transient 5xx responses before succeeding', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(geminiReply({ merchant: 'Recovered Store' }));
    const pending = extractReceipt([file], GEMINI_OPTS);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ merchant: 'Recovered Store' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('retries 429 using Retry-After before surfacing a typed rate-limit error', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 429,
        headers: { 'Retry-After': '0' },
      }),
    );
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({
      name: 'ExtractError',
      reason: 'rate_limit',
      status: 429,
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(new ExtractError('rate_limit').reason).toBe('rate_limit');
  });

  it('carries the provider error detail on 429 so the real cause is diagnosable', async () => {
    // 实测的 Mistral 429 响应体；限流头在浏览器里被 CORS 挡住，body 是唯一能读到的线索。
    const body = JSON.stringify({
      object: 'error',
      message: 'Rate limit exceeded',
      type: 'rate_limited',
      param: null,
      code: '1300',
      raw_status_code: 429,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 429, headers: { 'Retry-After': '0' } }),
    );
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({
      reason: 'rate_limit',
      status: 429,
      detail: 'Rate limit exceeded (1300)',
    });
  });

  it("carries Gemini's nested error message as detail", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }),
        { status: 429, headers: { 'Retry-After': '0' } },
      ),
    );
    await expect(extractReceipt([file], GEMINI_OPTS)).rejects.toMatchObject({
      reason: 'rate_limit',
      detail: 'Quota exceeded',
    });
  });

  it('maps 401 to auth and does not retry it', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({
      reason: 'auth',
      status: 401,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recognizes Gemini API_KEY_INVALID even when Google returns 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid' } }),
        { status: 400 },
      ),
    );
    await expect(extractReceipt([file], GEMINI_OPTS)).rejects.toMatchObject({
      reason: 'auth',
      status: 400,
    });
  });

  it('maps malformed/oversized input responses to request instead of auth', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 422 }));
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({
      reason: 'request',
      status: 422,
    });
  });

  it('surfaces empty successful responses instead of silently returning an empty object', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ candidates: [], promptFeedback: { blockReason: 'OTHER' } }), {
        status: 200,
      }),
    );
    await expect(extractReceipt([file], GEMINI_OPTS)).rejects.toMatchObject({ reason: 'empty' });
  });

  it('does not treat Mistral defaulting kind=expense as a successful extraction', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mistralReply({
        merchant: null,
        date: null,
        total: null,
        kind: 'expense',
        category: null,
        items: [],
        note: null,
      }),
    );
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({ reason: 'empty' });
  });

  it('surfaces malformed provider JSON as parse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ document_annotation: 'not json' }), { status: 200 }),
    );
    await expect(extractReceipt([file], MISTRAL_OPTS)).rejects.toMatchObject({ reason: 'parse' });
  });

  it('unknown category becomes a proposal and invalid date is dropped', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ merchant: 'X', date: 'last tuesday', total: 10, category: 'Pet Supplies' }),
    );
    const r = await extractReceipt([file], GEMINI_OPTS);
    expect(r).toMatchObject({ merchant: 'X', totalCents: 1000, newCategory: 'Pet Supplies' });
    expect(r.category).toBeUndefined();
    expect(r.date).toBeUndefined();
  });

  it('drops absurd category proposals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ merchant: 'X', category: 'x'.repeat(80) }),
    );
    const r = await extractReceipt([file], GEMINI_OPTS);
    expect(r.category).toBeUndefined();
    expect(r.newCategory).toBeUndefined();
  });

  it('validates an income category against the income list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiReply({ kind: 'income', category: 'Sales', total: 230 }),
    );
    await expect(extractReceipt([file], GEMINI_OPTS)).resolves.toMatchObject({
      kind: 'income',
      category: 'Sales',
      totalCents: 23000,
    });
  });

  it('keeps Gemini multi-photo input in one request, capped at four', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(geminiReply({ merchant: 'Same Receipt' }));
    const files = Array.from({ length: 6 }, (_, i) => ({
      blob: new Blob([String(i)], { type: 'image/webp' }),
      kind: 'webp' as const,
    }));
    await extractReceipt(files, GEMINI_OPTS);
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    const inlines = body.contents[0].parts.filter((p: { inline_data?: unknown }) => p.inline_data);
    expect(inlines).toHaveLength(4);
    expect(JSON.stringify(body)).toContain('SAME');
  });

  it('rejects an empty file list before calling a provider', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(extractReceipt([], MISTRAL_OPTS)).rejects.toMatchObject({ reason: 'request' });
    expect(spy).not.toHaveBeenCalled();
  });
});
