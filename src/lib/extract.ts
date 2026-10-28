// Mistral OCR / Gemini 均由浏览器直连，key 只放请求头且不进 URL。
// 服务端响应始终视为不可信数据；统一在本文件完成校验和归一化。
import { toBase64 } from '../sync/github';
import type { Locale } from './i18n';
import type { Kind, PhotoKind } from '../data/types';
import type { AiProvider } from './settings';
import { gstFromTotalCents } from './money';
import { knownCategoryNames } from './categories';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// 免费订阅层不含任何 OCR 模型：`/v1/ocr` 下每个 mistral-ocr-* 的
// `x-ratelimit-limit-req-minute` 都是 0，请求一律 429。带视觉能力的 ministral 系列可用。
// 钉死版本号，避免 `latest` 漂移到这一层用不了的模型上。
const MISTRAL_MODEL = 'ministral-14b-2512';
const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 1_000, 2_500];
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_FILES = 4;
// 客户端兜底上限；两家的服务端上限都没文档化，真超了会由 ExtractError.detail 带回原话。
const MAX_REQUEST_BODY_CHARS = 18_500_000;

export type ExtractReason = 'auth' | 'rate_limit' | 'network' | 'request' | 'parse' | 'empty';

export class ExtractError extends Error {
  override name = 'ExtractError';
  constructor(
    public reason: ExtractReason,
    public status?: number,
    // 服务端自己的说明。限流头在浏览器里被 CORS 挡住，响应体是唯一能读到的线索。
    public detail?: string,
  ) {
    super(`extract failed: ${reason}`);
  }
}

export interface Extraction {
  merchant?: string; // 收入发票是客户名（billTo），支出是开票方
  issuer?: string; // 开票方；切换收支时用来换回商家名
  billTo?: string; // 票面上的客户（Bill To）
  date?: string; // YYYY-MM-DD
  totalCents?: number;
  gstCents?: number; // 只在票面 GST 和 3/23 推算值不一样时给（不含 GST、混合票据）
  kind?: Kind;
  category?: string; // 命中现有分类（规范名）
  newCategory?: string; // 现有分类都不合适时，AI 提名的新分类（待加入）
  items?: string[];
  note?: string;
}

interface ExtractOpts {
  apiKey: string;
  provider: AiProvider;
  categories: Record<Kind, string[]>;
  locale: Locale;
}

interface RawExtraction {
  merchant?: unknown;
  date?: unknown;
  dateText?: unknown;
  total?: unknown;
  gst?: unknown;
  billTo?: unknown;
  kind?: unknown;
  category?: unknown;
  items?: unknown;
  note?: unknown;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    date: { type: 'STRING', description: 'ISO date YYYY-MM-DD' },
    dateText: { type: 'STRING', description: 'the date exactly as printed on the receipt' },
    total: { type: 'NUMBER', description: 'total amount incl. GST in dollars' },
    gst: { type: 'NUMBER', description: 'GST amount printed on the document, in dollars' },
    billTo: { type: 'STRING', description: 'customer name under Bill To / Invoice To' },
    kind: { type: 'STRING', enum: ['expense', 'income'] },
    category: { type: 'STRING' },
    items: { type: 'ARRAY', items: { type: 'STRING' } },
    note: { type: 'STRING' },
  },
};

const MISTRAL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    date: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'ISO date YYYY-MM-DD',
    },
    dateText: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'the date exactly as printed on the receipt, e.g. "05/10/2026"',
    },
    // Strict constrained decoding has had float expansion failures for JSON `number` fields.
    // A decimal string is exact for money and normalizeExtraction already validates/parses it.
    total: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'final total including GST as a decimal dollar string, e.g. "57.80"',
    },
    gst: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'GST amount printed on the document as a decimal dollar string, e.g. "7.54"',
    },
    billTo: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'customer name under Bill To / Invoice To',
    },
    kind: {
      anyOf: [{ type: 'string', enum: ['expense', 'income'] }, { type: 'null' }],
    },
    category: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    items: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'merchant',
    'date',
    'dateText',
    'total',
    'gst',
    'billTo',
    'kind',
    'category',
    'items',
    'note',
  ],
};

function buildPrompt(
  categories: Record<Kind, string[]>,
  locale: Locale,
  provider: AiProvider,
): string {
  const noteLang = locale === 'zh' ? 'Chinese' : 'English';
  const listed = new Set([...categories.expense, ...categories.income]);
  const standard = knownCategoryNames().filter((c) => !listed.has(c));
  return [
    'Extract structured data from this receipt or invoice (New Zealand context).',
    'Rules:',
    '- merchant: the name of the business that issued the document, cleaned up (no slogans/addresses).',
    '- billTo: the customer name printed under "Bill To", "Invoice To" or "Customer", if any.',
    '- date: the transaction/invoice date as YYYY-MM-DD. New Zealand writes numeric dates DAY first: DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY or DD-MM-YYYY. So 05/10/2026 is 5 October 2026, never May 10. Never read a numeric date in US month-first order. Two-digit years are 20YY.',
    '- dateText: the transaction/invoice date copied exactly as printed (digits, separators and month words unchanged, without the time).',
    '- total: the final total amount including GST, in dollars.',
    '- gst: the total GST amount printed on the document. Use 0 when it explicitly says no GST is charged or the seller is not GST registered, and for government fines or infringement notices (they carry no GST). If GST is simply not shown, leave it unknown.',
    "- kind: 'expense' for receipts/bills the user paid; 'income' only if this is clearly an invoice the user issued to a client. Default 'expense'.",
    `- category: use the best match from the existing list. For expense: ${categories.expense.join(', ')}. For income: ${categories.income.join(', ')}. If none is a good match, use one of these standard names instead: ${standard.join(', ')}. A repair or maintenance service is Repairs, not Equipment. Only if nothing fits, output a NEW concise category name (1-3 English words, Title Case).`,
    '- items: the main line items/services as a list, each entry like "Name ×qty" (keep original product names, max 10 entries; merge trivial ones).',
    `- note: other useful info in ${noteLang}: invoice number if present, payment method if visible. Max 80 characters. Separate parts with " · ". Do NOT repeat the items here.`,
    'If multiple attachments are provided, they are photos/pages of the SAME single receipt or invoice — combine them into one record.',
    provider === 'mistral'
      ? 'Return total as a decimal string. Use null for any other unknown field and [] for unknown items.'
      : 'Omit any field you cannot determine confidently.',
  ].join('\n');
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function retryDelay(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('Retry-After');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 0), 10_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), 10_000);
  }
  return RETRY_DELAYS_MS[attempt];
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

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
      });
      if (isTransientStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await delay(retryDelay(res, attempt + 1));
        continue;
      }
      return res;
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) throw new ExtractError('network');
      await delay(RETRY_DELAYS_MS[attempt + 1]);
    }
  }
  throw new ExtractError('network');
}

// Mistral 用顶层 `message`/`code`，Gemini 用嵌套 `error.message`；两边都提取成一句话。
function errorDetail(text: string): string | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { message?: unknown; code?: unknown; error?: { message?: unknown } };
      const message =
        typeof obj.message === 'string'
          ? obj.message
          : typeof obj.error?.message === 'string'
            ? obj.error.message
            : undefined;
      if (message) {
        const code =
          typeof obj.code === 'string' || typeof obj.code === 'number' ? String(obj.code) : '';
        return (code ? `${message} (${code})` : message).slice(0, 200);
      }
    }
  } catch {
    // 非 JSON 的错误体照样有诊断价值，原样截断带出去。
  }
  return raw.slice(0, 200);
}

async function throwForStatus(res: Response): Promise<void> {
  if (res.ok) return;
  const raw = await res
    .clone()
    .text()
    .catch(() => '');
  const detail = errorDetail(raw);
  if (res.status === 401 || res.status === 403) throw new ExtractError('auth', res.status, detail);
  if (res.status === 429) throw new ExtractError('rate_limit', res.status, detail);
  if (res.status === 400) {
    // Gemini 的无效 key 历史上会返回 400，而格式/模型错误也是 400；不能再一刀切。
    if (/API_KEY_INVALID|API key not valid|invalid[^\n]{0,30}api.?key/i.test(raw)) {
      throw new ExtractError('auth', res.status, detail);
    }
    throw new ExtractError('request', res.status, detail);
  }
  if (res.status === 413 || res.status === 415 || res.status === 422) {
    throw new ExtractError('request', res.status, detail);
  }
  throw new ExtractError('network', res.status, detail);
}

function parseJsonText(value: unknown): RawExtraction {
  if (value && typeof value === 'object') return value as RawExtraction;
  if (typeof value !== 'string' || !value.trim()) throw new ExtractError('empty');
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ExtractError('parse');
    }
    return parsed as RawExtraction;
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError('parse');
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function isCalendarDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 票面数字日期 → ISO。YYYY/MM/DD 年在前；其余一律按 NZ 日在前（DD/MM/YYYY、DD.MM.YY…）。带月份单词的返回 undefined，交给模型 */
function parsePrintedDate(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const ymd = /(?:^|\D)(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/.exec(text);
  if (ymd) return `${ymd[1]}-${pad2(Number(ymd[2]))}-${pad2(Number(ymd[3]))}`;
  const dmy = /(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(text);
  if (!dmy) return undefined;
  const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  return `${year}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
}

// 金额可能是 JSON number，也可能是 "1,234.50" / "$7.54" 这样的字符串
function parseDollars(v: unknown): number | null {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return typeof v === 'string' && !v.trim() ? null : Number.isFinite(n) ? n : null;
}

function normalizeExtraction(raw: RawExtraction, categories: Record<Kind, string[]>): Extraction {
  const kind: Kind = raw.kind === 'income' ? 'income' : 'expense';
  const out: Extraction = {};
  if (typeof raw.merchant === 'string' && raw.merchant.trim()) {
    out.merchant = out.issuer = raw.merchant.trim().slice(0, 120);
  }
  if (typeof raw.billTo === 'string' && raw.billTo.trim()) {
    out.billTo = raw.billTo.trim().slice(0, 120);
  }
  // 自己开出的发票，开票方是自己的公司——商家记客户，不然每笔收入都显示成自己公司的名字
  if (kind === 'income' && out.billTo) out.merchant = out.billTo;
  // 优先按 NZ 习惯（日在前）重新解析票面原文：模型偶尔会把 05/10 当成美式 5 月 10 日
  // 原文按日在前解析出不存在的日期（如海外单据 05/13/2026）时，退回模型给的 ISO 日期
  const printed = parsePrintedDate(raw.dateText);
  if (printed && isCalendarDate(printed)) out.date = printed;
  else if (typeof raw.date === 'string' && isCalendarDate(raw.date)) out.date = raw.date;
  const total = parseDollars(raw.total);
  if (total !== null && total > 0 && total < 1_000_000) {
    out.totalCents = Math.round(total * 100);
  }
  const gst = parseDollars(raw.gst);
  if (out.totalCents !== undefined && gst !== null) {
    const gstCents = Math.round(gst * 100);
    const auto = gstFromTotalCents(out.totalCents);
    // 差几分钱是四舍五入，照常按 3/23；比 3/23 还多说明读错了（例如读成了不含税小计）
    if (gstCents >= 0 && gstCents < auto - 2) out.gstCents = gstCents;
  }
  if (raw.kind === 'income' || raw.kind === 'expense') out.kind = raw.kind;
  if (typeof raw.category === 'string' && raw.category.trim()) {
    const name = raw.category.trim();
    const hit = categories[kind].find((c) => c.toLowerCase() === name.toLowerCase());
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
  if (typeof raw.note === 'string' && raw.note.trim()) {
    out.note = raw.note.trim().slice(0, 200);
  }
  return out;
}

function hasExtraction(out: Extraction): boolean {
  // kind 默认就是 expense，只有 kind 不代表真的识别出了任何票据信息。
  return !!(
    out.merchant ||
    out.date ||
    out.totalCents !== undefined ||
    out.category ||
    out.newCategory ||
    out.items?.length ||
    out.note
  );
}

async function extractGemini(
  files: { blob: Blob; kind: PhotoKind }[],
  opts: ExtractOpts,
): Promise<Extraction> {
  const inlineParts = await Promise.all(
    files.map(async (f) => ({
      inline_data: {
        mime_type: f.kind === 'pdf' ? 'application/pdf' : f.blob.type || 'image/webp',
        data: await toBase64(f.blob),
      },
    })),
  );

  const body = JSON.stringify({
    contents: [
      {
        parts: [...inlineParts, { text: buildPrompt(opts.categories, opts.locale, 'gemini') }],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  if (body.length > MAX_REQUEST_BODY_CHARS) throw new ExtractError('request');
  const res = await postJson(GEMINI_ENDPOINT, { 'x-goog-api-key': opts.apiKey }, body);
  await throwForStatus(res);
  let json: {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new ExtractError('parse');
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new ExtractError('empty');
  const out = normalizeExtraction(parseJsonText(text), opts.categories);
  if (!hasExtraction(out)) throw new ExtractError('empty');
  return out;
}

async function extractMistral(
  files: { blob: Blob; kind: PhotoKind }[],
  opts: ExtractOpts,
): Promise<Extraction> {
  // 全部页面放进同一个请求：模型自己跨页合并（商家/日期取首页、总额取末页），
  // 比过去按文件顺序请求再在客户端合并更准，也少占限额。
  const attachments = await Promise.all(
    files.map(async (f) => {
      const mime = f.kind === 'pdf' ? 'application/pdf' : f.blob.type || 'image/webp';
      const dataUrl = `data:${mime};base64,${await toBase64(f.blob)}`;
      return f.kind === 'pdf'
        ? { type: 'document_url', document_url: dataUrl }
        : { type: 'image_url', image_url: dataUrl };
    }),
  );

  const body = JSON.stringify({
    model: MISTRAL_MODEL,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(opts.categories, opts.locale, 'mistral') },
          ...attachments,
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'receipt_extraction',
        description: 'Structured fields from a New Zealand receipt or invoice',
        schema: MISTRAL_RESPONSE_SCHEMA,
        strict: true,
      },
    },
  });

  if (body.length > MAX_REQUEST_BODY_CHARS) throw new ExtractError('request');
  const res = await postJson(MISTRAL_ENDPOINT, { Authorization: `Bearer ${opts.apiKey}` }, body);
  await throwForStatus(res);
  let json: { choices?: { message?: { content?: string } }[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new ExtractError('parse');
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ExtractError('empty');
  const out = normalizeExtraction(parseJsonText(text), opts.categories);
  if (!hasExtraction(out)) throw new ExtractError('empty');
  return out;
}

export async function extractReceipt(
  inputFiles: { blob: Blob; kind: PhotoKind }[],
  opts: ExtractOpts,
): Promise<Extraction> {
  const files = inputFiles.slice(0, MAX_FILES);
  if (!files.length || !opts.apiKey.trim()) throw new ExtractError('request');
  return opts.provider === 'mistral' ? extractMistral(files, opts) : extractGemini(files, opts);
}
