// Gemini 2.5 Flash 免费层（1,500 次/天）：浏览器直连（CORS 已实测支持），
// key 走 x-goog-api-key 请求头（不进 URL，避免日志泄露）。
// 图片和 PDF 走同一个 inline_data 通道——这是选 Gemini 而非 GitHub Models 的核心原因。
import { toBase64 } from '../sync/github';
import type { Locale } from './i18n';
import type { Kind, PhotoKind } from '../data/types';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 450, 1200];
const REQUEST_TIMEOUT_MS = 45_000;

export type ExtractReason = 'auth' | 'rate_limit' | 'network' | 'parse';

export class ExtractError extends Error {
  override name = 'ExtractError';
  constructor(public reason: ExtractReason) {
    super(`extract failed: ${reason}`);
  }
}

export interface Extraction {
  merchant?: string;
  date?: string; // YYYY-MM-DD
  totalCents?: number;
  kind?: Kind;
  category?: string; // 命中现有分类（规范名）
  newCategory?: string; // 现有分类都不合适时，AI 提名的新分类（待加入）
  items?: string[];
  note?: string;
}

interface ExtractOpts {
  apiKey: string;
  categories: Record<Kind, string[]>;
  locale: Locale;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    date: { type: 'STRING', description: 'ISO date YYYY-MM-DD' },
    total: { type: 'NUMBER', description: 'total amount incl. GST in dollars' },
    kind: { type: 'STRING', enum: ['expense', 'income'] },
    category: { type: 'STRING' },
    items: { type: 'ARRAY', items: { type: 'STRING' } },
    note: { type: 'STRING' },
  },
};

function buildPrompt(categories: Record<Kind, string[]>, locale: Locale): string {
  const noteLang = locale === 'zh' ? 'Chinese' : 'English';
  return [
    'Extract structured data from this receipt or invoice (New Zealand context).',
    'Rules:',
    '- merchant: the business name, cleaned up (no slogans/addresses).',
    '- date: the transaction/invoice date as YYYY-MM-DD.',
    '- total: the final total amount including GST, in dollars.',
    "- kind: 'expense' for receipts/bills the user paid; 'income' only if this is clearly an invoice the user issued to a client. Default 'expense'.",
    `- category: strongly prefer the best match from the existing list. For expense: ${categories.expense.join(', ')}. For income: ${categories.income.join(', ')}. ONLY if none reasonably fits, output a NEW concise category name (1-3 English words, Title Case).`,
    '- items: the main line items/services as a list, each entry like "Name ×qty" (keep original product names, max 10 entries; merge trivial ones).',
    `- note: other useful info in ${noteLang}: invoice number if present, payment method if visible. Max 80 characters. Separate parts with " · ". Do NOT repeat the items here.`,
    'If multiple attachments are provided, they are photos/pages of the SAME single receipt or invoice — combine them into one record.',
    'Omit any field you cannot determine confidently.',
  ].join('\n');
}

const MAX_FILES = 4; // 防 payload 过大；一张票据极少超过 4 页/张

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postGemini(apiKey: string, body: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt]);
    try {
      const res = await fetchWithTimeout(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
      });
      if (isTransientStatus(res.status) && attempt < MAX_ATTEMPTS - 1) continue;
      return res;
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) throw new ExtractError('network');
    }
  }
  throw new ExtractError('network');
}

export async function extractReceipt(
  files: { blob: Blob; kind: PhotoKind }[],
  opts: ExtractOpts,
): Promise<Extraction> {
  const inlineParts = await Promise.all(
    files.slice(0, MAX_FILES).map(async (f) => ({
      inline_data: {
        mime_type: f.kind === 'pdf' ? 'application/pdf' : f.blob.type || 'image/webp',
        data: await toBase64(f.blob),
      },
    })),
  );

  const body = JSON.stringify({
    contents: [
      {
        parts: [...inlineParts, { text: buildPrompt(opts.categories, opts.locale) }],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const res = await postGemini(opts.apiKey, body);
  if (res.status === 429) throw new ExtractError('rate_limit');
  if (res.status === 400 || res.status === 401 || res.status === 403)
    throw new ExtractError('auth');
  if (!res.ok) throw new ExtractError('network');

  let raw: {
    merchant?: string;
    date?: string;
    total?: number;
    kind?: string;
    category?: string;
    items?: unknown;
    note?: string;
  };
  try {
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    raw = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
  } catch {
    throw new ExtractError('parse');
  }

  // 服务端输出不可信——逐字段校验
  const kind: Kind = raw.kind === 'income' ? 'income' : 'expense';
  const out: Extraction = {};
  if (raw.merchant?.trim()) out.merchant = raw.merchant.trim();
  if (raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) out.date = raw.date;
  if (typeof raw.total === 'number' && raw.total > 0 && raw.total < 1_000_000) {
    out.totalCents = Math.round(raw.total * 100);
  }
  if (raw.kind === 'income' || raw.kind === 'expense') out.kind = raw.kind;
  if (raw.category?.trim()) {
    const name = raw.category.trim();
    // 大小写不敏感归并到现有规范名；否则作为新分类提名（限长防 AI 胡编）
    const hit = opts.categories[kind].find((c) => c.toLowerCase() === name.toLowerCase());
    if (hit) out.category = hit;
    else if (name.length <= 30) out.newCategory = name;
  }
  if (Array.isArray(raw.items)) {
    const items = raw.items
      .filter((x): x is string => typeof x === 'string' && !!x.trim())
      .map((x) => x.trim().slice(0, 60))
      .slice(0, 12);
    if (items.length) out.items = items;
  }
  if (raw.note?.trim()) out.note = raw.note.trim().slice(0, 200);
  return out;
}
