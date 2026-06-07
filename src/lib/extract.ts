// Gemini 2.5 Flash 免费层（1,500 次/天）：浏览器直连（CORS 已实测支持），
// key 走 x-goog-api-key 请求头（不进 URL，避免日志泄露）。
// 图片和 PDF 走同一个 inline_data 通道——这是选 Gemini 而非 GitHub Models 的核心原因。
import { toBase64 } from '../sync/github';
import type { Locale } from './i18n';
import type { Kind, PhotoKind } from '../data/types';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
  category?: string;
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
    `- category: pick the single best match. For expense choose from: ${categories.expense.join(', ')}. For income choose from: ${categories.income.join(', ')}.`,
    `- note: a short useful summary in ${noteLang} (keep original product names): main items/services with quantities, invoice number if present, payment method if visible. Max 120 characters. Separate parts with " · ".`,
    'Omit any field you cannot determine confidently.',
  ].join('\n');
}

export async function extractReceipt(
  file: { blob: Blob; kind: PhotoKind },
  opts: ExtractOpts,
): Promise<Extraction> {
  const mime = file.kind === 'pdf' ? 'application/pdf' : file.blob.type || 'image/webp';
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mime, data: await toBase64(file.blob) } },
              { text: buildPrompt(opts.categories, opts.locale) },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      }),
    });
  } catch {
    throw new ExtractError('network');
  }
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
  if (raw.category && opts.categories[kind].includes(raw.category)) {
    out.category = raw.category;
  }
  if (raw.note?.trim()) out.note = raw.note.trim().slice(0, 200);
  return out;
}
