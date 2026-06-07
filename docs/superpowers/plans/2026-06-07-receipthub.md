# ReceiptHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自用 invoice/receipt 管理 PWA——iPhone 拍照/上传录入、五字段 + NZ GST、双空间、模糊搜索、CSV 导出，数据存私有 GitHub 仓库，部署 GitHub Pages。

**Architecture:** 本地优先：UI 只读写 IndexedDB（Dexie），outbox 模式后台同步到 `WilsonZheng/ReceiptHub-data` 私有仓库（Contents API + PAT，SHA 乐观锁，LWW 合并）。视觉方向未定——主题层全部走 CSS design tokens（`src/theme/tokens.css`），方向选定后只改 token 值。

**Tech Stack:** Vite + React 19 + TypeScript strict + Tailwind v4 + Dexie + minisearch + ulid + vite-plugin-pwa + Vitest + fake-indexeddb + Playwright。

**依赖标注:** Task 17-18（建远程仓库、部署）**BLOCKED**：需用户先 `gh auth login` 添加个人账号 `WilsonZheng`。Task 16（视觉打磨）**BLOCKED**：需用户三选一视觉方向。其余任务全部本地可完成。

**Spec:** `docs/superpowers/specs/2026-06-07-receipthub-design.md`

---

## File Structure

```
ReceiptHub/
├── index.html                      # iOS PWA meta + 字体
├── vite.config.ts                  # base /ReceiptHub/、PWA、vitest
├── tsconfig.json / eslint.config.js / .prettierrc
├── playwright.config.ts
├── .github/workflows/ci.yml        # tsc+lint+test+build
├── .github/workflows/deploy.yml    # Pages 部署
├── public/icons/                   # PWA 图标
└── src/
    ├── main.tsx                    # 挂载 + storage.persist()
    ├── App.tsx                     # 锁屏门 + Tab + Space 状态
    ├── theme/tokens.css            # design tokens（视觉方向晚绑定点）
    ├── lib/money.ts                # 分整数、GST 3/23、格式化   ← 纯函数
    ├── lib/csv.ts                  # CSV 生成 + 汇总            ← 纯函数
    ├── lib/image.ts                # 压缩/缩略图（canvas）
    ├── data/types.ts               # Receipt / Space / Config
    ├── data/db.ts                  # Dexie schema（4 张表）
    ├── data/repo.ts                # CRUD（写 receipts+outbox 同事务）
    ├── data/search.ts              # minisearch 封装
    ├── sync/github.ts              # Contents API 客户端
    ├── sync/merge.ts               # 月文件 LWW 合并            ← 纯函数
    ├── sync/engine.ts              # outbox flush + pull
    └── ui/
        ├── LockScreen.tsx  CaptureScreen.tsx  ReceiptsScreen.tsx
        ├── ReceiptDetail.tsx  ExportScreen.tsx  SettingsScreen.tsx
        └── components/SpaceToggle.tsx  TabBar.tsx  SyncDot.tsx
```

测试放 `src/**/*.test.ts`（Vitest 默认收集），e2e 放 `e2e/`。

---

### Task 1: 脚手架与工具链

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/theme/tokens.css`, `src/index.css`

- [ ] **Step 1: 初始化项目**

```bash
cd /Users/wzheng/sandbox/ReceiptHub
npm create vite@latest . -- --template react-ts   # 已有文件冲突时选 Ignore/merge
npm i dexie minisearch ulid
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa vitest fake-indexeddb @vitest/coverage-v8 \
  prettier eslint @playwright/test jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: 配置 vite + vitest**

`vite.config.ts`：

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ReceiptHub/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ReceiptHub',
        short_name: 'ReceiptHub',
        display: 'standalone',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
```

`src/test-setup.ts`：

```ts
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: tsconfig 开 strict**（vite 模板默认已开，确认 `"strict": true`），`.prettierrc`：

```json
{ "singleQuote": true, "semi": true, "printWidth": 100 }
```

- [ ] **Step 4: tokens.css 骨架（视觉方向晚绑定点）**

`src/theme/tokens.css`：

```css
/* 三个候选视觉方向只改这里的值，组件一律引用 token，禁止硬编码颜色 */
@theme {
  --color-bg: #0e1116;
  --color-surface: #151a21;
  --color-surface-2: #1a212b;
  --color-border: #1f2731;
  --color-ink: #e8ecf1;
  --color-ink-muted: #5d6878;
  --color-accent: #3ddc97;
  --color-accent-ink: #06070a;
  --color-danger: #ff6b6b;
  --font-display: -apple-system, system-ui, sans-serif;
  --font-numeric: ui-monospace, 'SF Mono', monospace;
  --radius-card: 12px;
}
```

`src/index.css`：

```css
@import 'tailwindcss';
@import './theme/tokens.css';
body { background: var(--color-bg); color: var(--color-ink); font-family: var(--font-display); }
```

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit && npm run build
```

Expected: 编译通过，dist/ 生成。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold vite+react+ts+tailwind+pwa toolchain"
```

---

### Task 2: money.ts —— GST 与金额（TDD）

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/money.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { formatNZD, gstFromTotalCents, parseNZD } from './money';

describe('gstFromTotalCents (NZ GST = total × 3/23)', () => {
  it.each([
    [11500, 1500],   // $115.00 → $15.00
    [18450, 2407],   // $184.50 → $24.07（四舍五入）
    [9230, 1204],    // $92.30 → $12.04
    [23, 3],
    [100, 13],       // 13.04… → 13
    [0, 0],
  ])('%i cents → %i cents', (total, gst) => {
    expect(gstFromTotalCents(total)).toBe(gst);
  });
});

describe('parseNZD', () => {
  it('parses dollars to cents', () => expect(parseNZD('184.50')).toBe(18450));
  it('accepts $ and commas', () => expect(parseNZD('$1,299.00')).toBe(129900));
  it('accepts bare integers', () => expect(parseNZD('92')).toBe(9200));
  it('rejects garbage', () => expect(parseNZD('abc')).toBeNull());
  it('rejects negatives', () => expect(parseNZD('-5')).toBeNull());
});

describe('formatNZD', () => {
  it('formats cents', () => expect(formatNZD(129900)).toBe('$1,299.00'));
  it('formats zero', () => expect(formatNZD(0)).toBe('$0.00'));
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/lib/money.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 最小实现**

`src/lib/money.ts`：

```ts
export function gstFromTotalCents(totalCents: number): number {
  return Math.round((totalCents * 3) / 23);
}

export function parseNZD(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function formatNZD(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-NZ');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/lib/money.test.ts
```

Expected: PASS 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts && git commit -m "feat: NZD money helpers with NZ GST 3/23 calculation"
```

---

### Task 3: 数据类型与 Dexie schema

**Files:**
- Create: `src/data/types.ts`, `src/data/db.ts`

- [ ] **Step 1: types.ts**

```ts
export type Space = 'personal' | 'company';
export type PhotoKind = 'webp' | 'jpeg' | 'pdf';

export interface PhotoRef {
  id: string;
  kind: PhotoKind;
}

export interface Receipt {
  id: string; // ULID
  space: Space;
  date: string; // YYYY-MM-DD
  merchant: string;
  totalCents: number;
  gstCents: number; // personal 空间恒为 0
  category: string;
  note?: string;
  photos: PhotoRef[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601，LWW 合并依据
  deleted?: boolean; // 软删除墓碑
}

export interface AppConfig {
  categories: Record<Space, string[]>;
}

export const DEFAULT_CONFIG: AppConfig = {
  categories: {
    company: ['Office Supplies', 'Software & SaaS', 'Fuel', 'Parking', 'Meals & Entertainment', 'Travel', 'Equipment', 'Other'],
    personal: ['Groceries', 'Dining', 'Transport', 'Utilities', 'Health', 'Other'],
  },
};
```

- [ ] **Step 2: db.ts**

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { PhotoKind, Receipt } from './types';

export interface PhotoRow {
  id: string;
  receiptId: string;
  kind: PhotoKind;
  full: Blob;
  thumb?: Blob; // pdf 无缩略图
  synced: 0 | 1;
}

export interface OutboxRow {
  seq?: number;
  kind: 'upsertReceipt' | 'putPhoto';
  refId: string; // receiptId 或 photoId
  attempts: number;
  lastError?: string;
}

export interface KvRow {
  key: string; // e.g. 'sha:personal/2026-06.json'
  value: string;
}

export const db = new Dexie('receipthub') as Dexie & {
  receipts: EntityTable<Receipt, 'id'>;
  photos: EntityTable<PhotoRow, 'id'>;
  outbox: EntityTable<OutboxRow, 'seq'>;
  kv: EntityTable<KvRow, 'key'>;
};

db.version(1).stores({
  receipts: 'id, space, date, updatedAt',
  photos: 'id, receiptId, synced',
  outbox: '++seq, kind, refId',
  kv: 'key',
});
```

- [ ] **Step 3: 验证编译并提交**

```bash
npx tsc --noEmit && git add src/data && git commit -m "feat: data types and dexie schema"
```

---

### Task 4: merge.ts —— 月文件合并（TDD，同步正确性核心）

**Files:**
- Create: `src/sync/merge.ts`, `src/sync/merge.test.ts`

- [ ] **Step 1: 写失败测试**

`src/sync/merge.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { mergeReceipts, monthKey, monthPath } from './merge';

const r = (id: string, updatedAt: string, extra: Partial<Receipt> = {}): Receipt => ({
  id, space: 'company', date: '2026-06-07', merchant: 'M', totalCents: 100, gstCents: 13,
  category: 'Other', photos: [], createdAt: '2026-06-07T00:00:00Z', updatedAt, ...extra,
});

describe('monthKey / monthPath', () => {
  it('extracts YYYY-MM', () => expect(monthKey('2026-06-07')).toBe('2026-06'));
  it('builds repo path', () =>
    expect(monthPath('company', '2026-06-07')).toBe('company/2026-06.json'));
});

describe('mergeReceipts (LWW by updatedAt, union by id)', () => {
  it('unions disjoint sets', () => {
    const out = mergeReceipts([r('a', '2026-06-01T00:00:00Z')], [r('b', '2026-06-02T00:00:00Z')]);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
  it('newer updatedAt wins', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z', { merchant: 'OLD' })],
      [r('a', '2026-06-03T00:00:00Z', { merchant: 'NEW' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].merchant).toBe('NEW');
  });
  it('tombstone survives merge', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z')],
      [r('a', '2026-06-03T00:00:00Z', { deleted: true })],
    );
    expect(out[0].deleted).toBe(true);
  });
  it('older edit does not resurrect tombstone', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-05T00:00:00Z', { deleted: true })],
      [r('a', '2026-06-02T00:00:00Z', { merchant: 'STALE' })],
    );
    expect(out[0].deleted).toBe(true);
  });
  it('output sorted by date desc then id', () => {
    const out = mergeReceipts(
      [r('a', '2026-06-01T00:00:00Z', { date: '2026-06-01' })],
      [r('b', '2026-06-01T00:00:00Z', { date: '2026-06-09' })],
    );
    expect(out[0].id).toBe('b');
  });
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/sync/merge.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`src/sync/merge.ts`：

```ts
import type { Receipt, Space } from '../data/types';

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthPath(space: Space, date: string): string {
  return `${space}/${monthKey(date)}.json`;
}

export function mergeReceipts(a: Receipt[], b: Receipt[]): Receipt[] {
  const byId = new Map<string, Receipt>();
  for (const rec of [...a, ...b]) {
    const existing = byId.get(rec.id);
    if (!existing || rec.updatedAt > existing.updatedAt) byId.set(rec.id, rec);
  }
  return [...byId.values()].sort((x, y) =>
    x.date === y.date ? (x.id < y.id ? 1 : -1) : x.date < y.date ? 1 : -1,
  );
}
```

- [ ] **Step 4: 确认通过**

```bash
npx vitest run src/sync/merge.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync && git commit -m "feat: month-file LWW merge with tombstones"
```

---

### Task 5: csv.ts —— 导出与汇总（TDD）

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/csv.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/csv.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Receipt } from '../data/types';
import { receiptsToCsv, summarize } from './csv';

const rec = (extra: Partial<Receipt>): Receipt => ({
  id: '01J', space: 'company', date: '2026-06-07', merchant: 'Bunnings', totalCents: 18450,
  gstCents: 2407, category: 'Equipment', photos: [], createdAt: '', updatedAt: '', ...extra,
});

describe('receiptsToCsv', () => {
  it('emits header and rows with net = total - gst', () => {
    const csv = receiptsToCsv([rec({})]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('Date,Merchant,Category,Net (NZD),GST (NZD),Total (NZD),Note,ReceiptID');
    expect(row).toBe('2026-06-07,Bunnings,Equipment,160.43,24.07,184.50,,01J');
  });
  it('escapes quotes and commas', () => {
    const csv = receiptsToCsv([rec({ merchant: 'A "B", C', note: 'x,y' })]);
    expect(csv).toContain('"A ""B"", C"');
    expect(csv).toContain('"x,y"');
  });
});

describe('summarize', () => {
  it('totals and per-category subtotals', () => {
    const s = summarize([rec({}), rec({ id: '01K', totalCents: 11500, gstCents: 1500, category: 'Fuel' })]);
    expect(s.count).toBe(2);
    expect(s.totalCents).toBe(29950);
    expect(s.gstCents).toBe(3907);
    expect(s.netCents).toBe(26043);
    expect(s.byCategory).toEqual({ Equipment: 18450, Fuel: 11500 });
  });
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/lib/csv.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/lib/csv.ts`：

```ts
import type { Receipt } from '../data/types';

const esc = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const money = (cents: number): string => (cents / 100).toFixed(2);

export function receiptsToCsv(receipts: Receipt[]): string {
  const header = 'Date,Merchant,Category,Net (NZD),GST (NZD),Total (NZD),Note,ReceiptID';
  const rows = receipts.map((r) =>
    [r.date, esc(r.merchant), esc(r.category), money(r.totalCents - r.gstCents),
     money(r.gstCents), money(r.totalCents), esc(r.note ?? ''), r.id].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

export interface Summary {
  count: number;
  totalCents: number;
  gstCents: number;
  netCents: number;
  byCategory: Record<string, number>;
}

export function summarize(receipts: Receipt[]): Summary {
  const s: Summary = { count: 0, totalCents: 0, gstCents: 0, netCents: 0, byCategory: {} };
  for (const r of receipts) {
    s.count++;
    s.totalCents += r.totalCents;
    s.gstCents += r.gstCents;
    s.byCategory[r.category] = (s.byCategory[r.category] ?? 0) + r.totalCents;
  }
  s.netCents = s.totalCents - s.gstCents;
  return s;
}
```

- [ ] **Step 4: 确认通过并提交**

```bash
npx vitest run src/lib/csv.test.ts
git add src/lib/csv.ts src/lib/csv.test.ts && git commit -m "feat: csv export and gst summary"
```

---

### Task 6: repo.ts —— 本地 CRUD + outbox（TDD，fake-indexeddb）

**Files:**
- Create: `src/data/repo.ts`, `src/data/repo.test.ts`

- [ ] **Step 1: 写失败测试**

`src/data/repo.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { listReceipts, saveReceipt, softDeleteReceipt, updateReceipt } from './repo';

beforeEach(async () => {
  await db.receipts.clear();
  await db.photos.clear();
  await db.outbox.clear();
});

const input = {
  space: 'company' as const, date: '2026-06-07', merchant: 'Bunnings',
  totalCents: 18450, gstCents: 2407, category: 'Equipment', note: '',
  files: [{ full: new Blob(['x']), thumb: new Blob(['t']), kind: 'webp' as const }],
};

describe('saveReceipt', () => {
  it('writes receipt + photo rows + outbox entries atomically', async () => {
    const rec = await saveReceipt(input);
    expect(rec.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(await db.receipts.count()).toBe(1);
    expect(await db.photos.count()).toBe(1);
    const ops = await db.outbox.toArray();
    expect(ops.map((o) => o.kind).sort()).toEqual(['putPhoto', 'upsertReceipt']);
  });
});

describe('updateReceipt', () => {
  it('bumps updatedAt and enqueues upsert', async () => {
    const rec = await saveReceipt(input);
    await db.outbox.clear();
    const updated = await updateReceipt(rec.id, { merchant: 'Z Energy' });
    expect(updated.merchant).toBe('Z Energy');
    expect(updated.updatedAt > rec.updatedAt).toBe(true);
    expect((await db.outbox.toArray())[0].kind).toBe('upsertReceipt');
  });
});

describe('softDeleteReceipt / listReceipts', () => {
  it('tombstones hide from list but stay in table', async () => {
    const rec = await saveReceipt(input);
    await softDeleteReceipt(rec.id);
    expect(await listReceipts('all')).toHaveLength(0);
    expect((await db.receipts.get(rec.id))?.deleted).toBe(true);
  });
  it('filters by space, sorted date desc', async () => {
    await saveReceipt({ ...input, date: '2026-06-01' });
    await saveReceipt({ ...input, space: 'personal', gstCents: 0, date: '2026-06-05' });
    expect((await listReceipts('company')).map((r) => r.space)).toEqual(['company']);
    expect((await listReceipts('all'))[0].date).toBe('2026-06-05');
  });
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/data/repo.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/data/repo.ts`：

```ts
import { ulid } from 'ulid';
import { db } from './db';
import type { PhotoKind, Receipt, Space } from './types';

export interface NewReceiptInput {
  space: Space;
  date: string;
  merchant: string;
  totalCents: number;
  gstCents: number;
  category: string;
  note?: string;
  files: { full: Blob; thumb?: Blob; kind: PhotoKind }[];
}

export async function saveReceipt(input: NewReceiptInput): Promise<Receipt> {
  const now = new Date().toISOString();
  const receipt: Receipt = {
    id: ulid(), space: input.space, date: input.date, merchant: input.merchant.trim(),
    totalCents: input.totalCents, gstCents: input.space === 'company' ? input.gstCents : 0,
    category: input.category, note: input.note?.trim() || undefined,
    photos: input.files.map((f) => ({ id: ulid(), kind: f.kind })),
    createdAt: now, updatedAt: now,
  };
  await db.transaction('rw', [db.receipts, db.photos, db.outbox], async () => {
    await db.receipts.add(receipt);
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i];
      await db.photos.add({ id: receipt.photos[i].id, receiptId: receipt.id, kind: f.kind, full: f.full, thumb: f.thumb, synced: 0 });
      await db.outbox.add({ kind: 'putPhoto', refId: receipt.photos[i].id, attempts: 0 });
    }
    await db.outbox.add({ kind: 'upsertReceipt', refId: receipt.id, attempts: 0 });
  });
  return receipt;
}

export async function updateReceipt(id: string, patch: Partial<Omit<Receipt, 'id' | 'createdAt'>>): Promise<Receipt> {
  const existing = await db.receipts.get(id);
  if (!existing) throw new Error(`receipt ${id} not found`);
  const updated: Receipt = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.transaction('rw', [db.receipts, db.outbox], async () => {
    await db.receipts.put(updated);
    await db.outbox.add({ kind: 'upsertReceipt', refId: id, attempts: 0 });
  });
  return updated;
}

export async function softDeleteReceipt(id: string): Promise<void> {
  await updateReceipt(id, { deleted: true });
}

export async function listReceipts(space: Space | 'all'): Promise<Receipt[]> {
  const all = space === 'all' ? await db.receipts.toArray() : await db.receipts.where('space').equals(space).toArray();
  return all.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Step 4: 确认通过并提交**

```bash
npx vitest run src/data/repo.test.ts
git add src/data && git commit -m "feat: local CRUD with outbox enqueue"
```

---

### Task 7: search.ts —— 模糊搜索（TDD）

**Files:**
- Create: `src/data/search.ts`, `src/data/search.test.ts`

- [ ] **Step 1: 写失败测试**

`src/data/search.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Receipt } from './types';
import { buildIndex, searchReceipts } from './search';

const rec = (id: string, extra: Partial<Receipt>): Receipt => ({
  id, space: 'company', date: '2026-06-07', merchant: 'M', totalCents: 18450, gstCents: 2407,
  category: 'Other', photos: [], createdAt: '', updatedAt: '', ...extra,
});

const docs = [
  rec('1', { merchant: 'Bunnings Warehouse', category: 'Equipment' }),
  rec('2', { merchant: 'Z Energy Penrose', category: 'Fuel', note: 'trip to Hamilton' }),
  rec('3', { merchant: 'JB Hi-Fi', totalCents: 129900 }),
];

describe('searchReceipts', () => {
  const idx = buildIndex(docs);
  it('matches merchant with typo (fuzzy)', () =>
    expect(searchReceipts(idx, 'bunings')).toContain('1'));
  it('matches note words', () => expect(searchReceipts(idx, 'hamilton')).toContain('2'));
  it('matches category prefix', () => expect(searchReceipts(idx, 'equip')).toContain('1'));
  it('matches amount string', () => expect(searchReceipts(idx, '1299')).toContain('3'));
  it('empty query returns empty', () => expect(searchReceipts(idx, '  ')).toEqual([]));
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/data/search.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/data/search.ts`：

```ts
import MiniSearch from 'minisearch';
import type { Receipt } from './types';

type Doc = { id: string; merchant: string; note: string; category: string; amount: string };

const toDoc = (r: Receipt): Doc => ({
  id: r.id, merchant: r.merchant, note: r.note ?? '', category: r.category,
  amount: `${(r.totalCents / 100).toFixed(2)} ${Math.round(r.totalCents / 100)}`,
});

export function buildIndex(receipts: Receipt[]): MiniSearch<Doc> {
  const idx = new MiniSearch<Doc>({
    fields: ['merchant', 'note', 'category', 'amount'],
    searchOptions: { fuzzy: 0.25, prefix: true },
  });
  idx.addAll(receipts.filter((r) => !r.deleted).map(toDoc));
  return idx;
}

export function searchReceipts(idx: MiniSearch<Doc>, query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  return idx.search(q).map((r) => String(r.id));
}
```

- [ ] **Step 4: 确认通过并提交**

```bash
npx vitest run src/data/search.test.ts
git add src/data && git commit -m "feat: minisearch fuzzy search over receipts"
```

---

### Task 8: github.ts —— Contents API 客户端（TDD，mock fetch）

**Files:**
- Create: `src/sync/github.ts`, `src/sync/github.test.ts`

- [ ] **Step 1: 写失败测试**

`src/sync/github.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClient, toBase64 } from './github';

const client = () => new GithubClient('tok', 'WilsonZheng/ReceiptHub-data');
afterEach(() => vi.restoreAllMocks());

const mockFetch = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );

describe('toBase64', () => {
  it('handles unicode', async () => {
    expect(await toBase64(new Blob(['票据 $1,299']))).toBe(btoa(unescape(encodeURIComponent('票据 $1,299'))));
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

describe('putFile', () => {
  it('PUTs base64 content with sha and returns new sha', async () => {
    const spy = mockFetch(200, { content: { sha: 'new' } });
    const sha = await client().putFile('company/2026-06.json', '[]', { sha: 'old', message: 'm' });
    expect(sha).toBe('new');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/repos/WilsonZheng/ReceiptHub-data/contents/company/2026-06.json');
    expect(JSON.parse(String(init?.body))).toMatchObject({ sha: 'old', content: btoa('[]') });
  });
  it('throws ConflictError on 409/422 sha mismatch', async () => {
    mockFetch(409, { message: 'conflict' });
    await expect(client().putFile('p', 'c', { message: 'm' })).rejects.toMatchObject({ name: 'ConflictError' });
  });
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/sync/github.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/sync/github.ts`：

```ts
const API = 'https://api.github.com';

export class AuthError extends Error {
  name = 'AuthError' as const;
}
export class ConflictError extends Error {
  name = 'ConflictError' as const;
}

export interface RemoteFile {
  text: string;
  sha: string;
}

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GithubClient {
  constructor(
    private token: string,
    private repo: string, // 'owner/name'
  ) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${API}/repos/${this.repo}/contents/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw new AuthError(`github ${res.status}`);
    if (res.status === 409 || res.status === 422) throw new ConflictError(`github ${res.status}`);
    return res;
  }

  async getFile(path: string): Promise<RemoteFile | null> {
    const res = await this.req(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github GET ${path}: ${res.status}`);
    const json = (await res.json()) as { content: string; sha: string };
    return { text: fromBase64(json.content), sha: json.sha };
  }

  async putRaw(path: string, base64: string, opts: { sha?: string; message: string }): Promise<string> {
    const res = await this.req(path, {
      method: 'PUT',
      body: JSON.stringify({ message: opts.message, content: base64, ...(opts.sha ? { sha: opts.sha } : {}) }),
    });
    if (!res.ok) throw new Error(`github PUT ${path}: ${res.status}`);
    const json = (await res.json()) as { content: { sha: string } };
    return json.content.sha;
  }

  async putFile(path: string, text: string, opts: { sha?: string; message: string }): Promise<string> {
    return this.putRaw(path, await toBase64(new Blob([text])), opts);
  }

  async listDir(path: string): Promise<{ path: string; sha: string }[]> {
    const res = await this.req(path);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`github LIST ${path}: ${res.status}`);
    const json = (await res.json()) as { path: string; sha: string }[];
    return json.map((e) => ({ path: e.path, sha: e.sha }));
  }
}
```

- [ ] **Step 4: 确认通过并提交**

```bash
npx vitest run src/sync/github.test.ts
git add src/sync && git commit -m "feat: github contents api client with typed errors"
```

---

### Task 9: engine.ts —— 同步引擎（TDD，mock client）

**Files:**
- Create: `src/sync/engine.ts`, `src/sync/engine.test.ts`

- [ ] **Step 1: 写失败测试**

`src/sync/engine.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { saveReceipt } from '../data/repo';
import { ConflictError, type GithubClient } from './github';
import { flushOutbox, pullSpace } from './engine';

beforeEach(async () => {
  await Promise.all([db.receipts.clear(), db.photos.clear(), db.outbox.clear(), db.kv.clear()]);
});

const input = {
  space: 'company' as const, date: '2026-06-07', merchant: 'Bunnings', totalCents: 18450,
  gstCents: 2407, category: 'Equipment', files: [{ full: new Blob(['x']), kind: 'webp' as const }],
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
    listDir: vi.fn(async (p: string) =>
      [...remote.keys()].filter((k) => k.startsWith(p + '/')).map((k) => ({ path: k, sha: String(remote.get(k)!.sha) })),
    ),
  } as unknown as GithubClient;
}

describe('flushOutbox', () => {
  it('uploads photo then month json, clears outbox, marks photo synced', async () => {
    const remote = new Map();
    await saveReceipt(input);
    await flushOutbox(fakeClient(remote));
    expect(await db.outbox.count()).toBe(0);
    expect((await db.photos.toArray())[0].synced).toBe(1);
    const month = remote.get('company/2026-06.json');
    expect(month).toBeDefined();
    expect(JSON.parse(month!.text)).toHaveLength(1);
  });

  it('retries on sha conflict by re-reading and merging', async () => {
    const remote = new Map([['company/2026-06.json', { text: '[]', sha: 5 }]]);
    await db.kv.put({ key: 'sha:company/2026-06.json', value: '3' }); // 故意过期
    await saveReceipt({ ...input, files: [] });
    await flushOutbox(fakeClient(remote));
    expect(JSON.parse(remote.get('company/2026-06.json')!.text)).toHaveLength(1);
  });
});

describe('pullSpace', () => {
  it('fetches changed months and merges into local', async () => {
    const remoteRec = { id: '01HREMOTE0000000000000000A', space: 'company', date: '2026-06-03',
      merchant: 'Remote', totalCents: 100, gstCents: 13, category: 'Other', photos: [],
      createdAt: '2026-06-03T00:00:00Z', updatedAt: '2026-06-03T00:00:00Z' };
    const remote = new Map([['company/2026-06.json', { text: JSON.stringify([remoteRec]), sha: 1 }]]);
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
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/sync/engine.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/sync/engine.ts`：

```ts
import { db } from '../data/db';
import type { Receipt, Space } from '../data/types';
import { ConflictError, GithubClient, toBase64 } from './github';
import { mergeReceipts, monthPath } from './merge';

const MAX_ATTEMPTS = 5;
const shaKey = (path: string) => `sha:${path}`;

async function upsertToMonth(client: GithubClient, receipt: Receipt): Promise<void> {
  const path = monthPath(receipt.space, receipt.date);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cached = (await db.kv.get(shaKey(path)))?.value;
    let remoteText = '[]';
    let sha = cached;
    if (attempt > 0 || !cached) {
      const remote = await client.getFile(path);
      remoteText = remote?.text ?? '[]';
      sha = remote?.sha;
    } else {
      const remote = await client.getFile(path);
      remoteText = remote?.text ?? '[]';
      sha = remote?.sha;
    }
    const merged = mergeReceipts(JSON.parse(remoteText) as Receipt[], [receipt]);
    try {
      const newSha = await client.putFile(path, JSON.stringify(merged, null, 1), {
        sha, message: `sync: ${receipt.merchant} ${receipt.date}`,
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
  const photosFirst = [...ops.filter((o) => o.kind === 'putPhoto'), ...ops.filter((o) => o.kind === 'upsertReceipt')];
  for (const op of photosFirst) {
    try {
      if (op.kind === 'putPhoto') {
        const photo = await db.photos.get(op.refId);
        if (photo) {
          const ext = photo.kind === 'pdf' ? 'pdf' : photo.kind;
          await client.putRaw(
            `photos/${photo.receiptId}/${photo.id}.${ext}`,
            await toBase64(photo.full),
            { message: `photo: ${photo.id}` },
          );
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
      throw e; // 让调用方决定退避；剩余 ops 下轮再处理
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
```

- [ ] **Step 4: 确认通过**

```bash
npx vitest run src/sync/engine.test.ts
```

Expected: PASS。注意 `upsertToMonth` 里两个分支等价（都重新 GET）——实现后简化为单一路径再跑测试。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npx tsc --noEmit
git add src/sync && git commit -m "feat: outbox flush and pull sync engine"
```

---

### Task 10: image.ts —— 压缩与缩略图

**Files:**
- Create: `src/lib/image.ts`, `src/lib/image.test.ts`

canvas 在 jsdom 里不可用——纯函数部分（尺寸计算、类型判断）单测，canvas 路径靠 Task 15 的 Playwright 验证。

- [ ] **Step 1: 写失败测试（纯函数部分）**

`src/lib/image.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { fitWithin, pickKind } from './image';

describe('fitWithin', () => {
  it('scales down long edge to max', () => expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 }));
  it('portrait', () => expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 }));
  it('never upscales', () => expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 }));
});

describe('pickKind', () => {
  it('pdf passthrough', () => expect(pickKind('application/pdf')).toBe('pdf'));
  it('images default webp', () => expect(pickKind('image/heic')).toBe('webp'));
});
```

- [ ] **Step 2: 确认失败**

```bash
npx vitest run src/lib/image.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/lib/image.ts`：

```ts
import type { PhotoKind } from '../data/types';

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 300;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export function pickKind(mime: string): PhotoKind {
  return mime === 'application/pdf' ? 'pdf' : 'webp';
}

async function drawToBlob(bitmap: ImageBitmap, max: number): Promise<{ blob: Blob; kind: PhotoKind }> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const tryType = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const webp = await tryType('image/webp', 0.8);
  if (webp && webp.type === 'image/webp') return { blob: webp, kind: 'webp' };
  const jpeg = await tryType('image/jpeg', 0.8);
  if (!jpeg) throw new Error('canvas encoding failed');
  return { blob: jpeg, kind: 'jpeg' };
}

export interface ProcessedFile {
  full: Blob;
  thumb?: Blob;
  kind: PhotoKind;
}

export async function processFile(file: File): Promise<ProcessedFile> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('PDF over 20MB');
    return { full: file, kind: 'pdf' };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const full = await drawToBlob(bitmap, MAX_EDGE);
    const thumb = await drawToBlob(bitmap, THUMB_EDGE);
    return { full: full.blob, thumb: thumb.blob, kind: full.kind };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 4: 确认通过并提交**

```bash
npx vitest run src/lib/image.test.ts && npx tsc --noEmit
git add src/lib && git commit -m "feat: image compression with webp/jpeg fallback and thumbnails"
```

---

### Task 11: App 壳 —— 锁屏门、Space 切换、TabBar、设置存储

**Files:**
- Create: `src/lib/settings.ts`, `src/ui/LockScreen.tsx`, `src/ui/components/SpaceToggle.tsx`, `src/ui/components/TabBar.tsx`, `src/ui/components/SyncDot.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: settings.ts（PAT/配置的 localStorage 封装）**

```ts
import { DEFAULT_CONFIG, type AppConfig } from '../data/types';

const PAT_KEY = 'rh.pat';
const CONFIG_KEY = 'rh.config';
export const DATA_REPO = 'WilsonZheng/ReceiptHub-data';

export const getPat = (): string | null => localStorage.getItem(PAT_KEY);
export const setPat = (pat: string): void => localStorage.setItem(PAT_KEY, pat.trim());
export const clearPat = (): void => localStorage.removeItem(PAT_KEY);

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as AppConfig) : DEFAULT_CONFIG;
}
export function setConfig(c: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}
```

- [ ] **Step 2: App.tsx —— 状态机（无路由库）**

```tsx
import { useState } from 'react';
import { getPat } from './lib/settings';
import type { Space } from './data/types';
import { LockScreen } from './ui/LockScreen';
import { CaptureScreen } from './ui/CaptureScreen';
import { ReceiptsScreen } from './ui/ReceiptsScreen';
import { ExportScreen } from './ui/ExportScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SpaceToggle } from './ui/components/SpaceToggle';
import { TabBar, type Tab } from './ui/components/TabBar';
import { SyncDot } from './ui/components/SyncDot';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => !!getPat());
  const [tab, setTab] = useState<Tab>('capture');
  const [space, setSpace] = useState<Space>('company');

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold">ReceiptHub</h1>
        <div className="flex items-center gap-3">
          <SyncDot />
          <SpaceToggle space={space} onChange={setSpace} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-2">
        {tab === 'capture' && <CaptureScreen space={space} onSaved={() => setTab('receipts')} />}
        {tab === 'receipts' && <ReceiptsScreen space={space} />}
        {tab === 'export' && <ExportScreen space={space} />}
        {tab === 'settings' && <SettingsScreen onPatCleared={() => setUnlocked(false)} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
```

- [ ] **Step 3: 三个小组件**

`src/ui/components/SpaceToggle.tsx`：

```tsx
import type { Space } from '../../data/types';

export function SpaceToggle({ space, onChange }: { space: Space; onChange: (s: Space) => void }) {
  return (
    <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
      {(['company', 'personal'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
          style={
            space === s
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { color: 'var(--color-ink-muted)' }
          }
        >
          {s}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/components/TabBar.tsx`：

```tsx
export type Tab = 'capture' | 'receipts' | 'export' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'capture', label: 'Capture', icon: '📷' },
  { id: 'receipts', label: 'Receipts', icon: '📋' },
  { id: 'export', label: 'Export', icon: '📤' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="flex justify-around border-t pb-[env(safe-area-inset-bottom)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="flex min-h-11 flex-col items-center px-4 py-1.5 text-[10px]"
          style={{ opacity: tab === t.id ? 1 : 0.4 }}
          aria-current={tab === t.id}
        >
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
```

`src/ui/components/SyncDot.tsx`（Task 12 接同步状态，先静态占位）：

```tsx
import { useSyncStatus } from '../../sync/useSync';

const COLORS = { idle: 'var(--color-accent)', syncing: '#f0b429', offline: 'var(--color-ink-muted)', error: 'var(--color-danger)' };

export function SyncDot() {
  const { status, pending } = useSyncStatus();
  return (
    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[status] }} />
      {pending > 0 ? `${pending}` : ''}
    </span>
  );
}
```

- [ ] **Step 4: LockScreen.tsx**

```tsx
import { useState } from 'react';
import { setPat, DATA_REPO } from '../lib/settings';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-8">
      <h1 className="text-2xl font-bold">ReceiptHub</h1>
      <p className="text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        Paste a fine-grained PAT with Contents read/write on <code>{DATA_REPO}</code>
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="github_pat_…"
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      />
      <button
        disabled={!value.trim()}
        onClick={() => { setPat(value); onUnlock(); }}
        className="w-full rounded-lg py-2 font-semibold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        Unlock
      </button>
    </div>
  );
}
```

- [ ] **Step 5: main.tsx 挂载 + storage persist**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

void navigator.storage?.persist?.();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

此步骤暂时给四个 Screen 建最小占位文件（每个导出一个空组件返回 `<div>TODO</div>` 会违反 No-Placeholder 原则——但 Task 12-15 立即填充真实实现；为保证本任务可编译，先创建文件并填入各 Task 的最终代码框架中最小可编译版本：仅 props 签名 + 空 JSX 容器）。

- [ ] **Step 6: 验证 + 提交**

```bash
npx tsc --noEmit && npm run build && npm run dev   # 手动确认锁屏→解锁→Tab 切换
git add -A && git commit -m "feat: app shell with lock gate, space toggle, tab bar"
```

---

### Task 12: 同步接线 —— useSync hook

**Files:**
- Create: `src/sync/useSync.ts`

- [ ] **Step 1: 实现 hook（轮询 outbox 数量 + online 监听 + 周期 flush/pull）**

```ts
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { getPat, DATA_REPO } from '../lib/settings';
import { AuthError, GithubClient } from './github';
import { flushOutbox, pullAll } from './engine';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
let authErrorHandler: (() => void) | null = null;
export const onAuthError = (fn: () => void) => (authErrorHandler = fn);

const state = { status: 'idle' as SyncStatus, listeners: new Set<() => void>() };
const setStatus = (s: SyncStatus) => { state.status = s; state.listeners.forEach((l) => l()); };

export async function syncNow(): Promise<void> {
  const pat = getPat();
  if (!pat) return;
  if (!navigator.onLine) return setStatus('offline');
  setStatus('syncing');
  try {
    const client = new GithubClient(pat, DATA_REPO);
    await flushOutbox(client);
    await pullAll(client);
    setStatus('idle');
  } catch (e) {
    setStatus('error');
    if (e instanceof AuthError) authErrorHandler?.();
  }
}

export function useSyncStatus(): { status: SyncStatus; pending: number } {
  const [status, setLocal] = useState(state.status);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const listener = () => setLocal(state.status);
    state.listeners.add(listener);
    const sub = liveQuery(() => db.outbox.count()).subscribe(setPending);
    const onlineHandler = () => void syncNow();
    window.addEventListener('online', onlineHandler);
    const interval = setInterval(() => void syncNow(), 60_000);
    void syncNow();
    return () => {
      state.listeners.delete(listener);
      sub.unsubscribe();
      window.removeEventListener('online', onlineHandler);
      clearInterval(interval);
    };
  }, []);
  return { status, pending };
}
```

- [ ] **Step 2: 验证 + 提交**

```bash
npx tsc --noEmit && npx vitest run
git add src/sync && git commit -m "feat: sync hook with online/interval triggers and auth error surfacing"
```

---

### Task 13: CaptureScreen —— 拍照/相册/PDF/拖拽/粘贴 + 五字段表单

**Files:**
- Create: `src/ui/CaptureScreen.tsx`

- [ ] **Step 1: 实现**

```tsx
import { useEffect, useRef, useState } from 'react';
import { processFile, type ProcessedFile } from '../lib/image';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { getConfig } from '../lib/settings';
import { saveReceipt } from '../data/repo';
import { db } from '../data/db';
import type { Space } from '../data/types';

const today = () => new Date().toISOString().slice(0, 10);

export function CaptureScreen({ space, onSaved }: { space: Space; onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [date, setDate] = useState(today());
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [gstOverride, setGstOverride] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [merchants, setMerchants] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void db.receipts.orderBy('updatedAt').reverse().limit(200).toArray()
      .then((rs) => setMerchants([...new Set(rs.map((r) => r.merchant))]));
  }, []);

  // 桌面: 拖拽 + 粘贴
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles([...(e.clipboardData?.files ?? [])]);
    const onDrop = (e: DragEvent) => { e.preventDefault(); addFiles([...(e.dataTransfer?.files ?? [])]); };
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDrag);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDrag);
    };
  });

  async function addFiles(list: File[]) {
    try {
      const processed = await Promise.all(list.map(processFile));
      setFiles((cur) => [...cur, ...processed]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'file processing failed');
    }
  }

  const totalCents = parseNZD(total);
  const gstCents = gstOverride ?? (totalCents !== null ? gstFromTotalCents(totalCents) : 0);
  const canSave = files.length > 0 && merchant.trim() && totalCents !== null && category;

  async function handleSave() {
    if (!canSave || totalCents === null) return;
    await saveReceipt({ space, date, merchant, totalCents, gstCents: space === 'company' ? gstCents : 0, category, note, files });
    onSaved();
  }

  const categories = getConfig().categories[space];

  return (
    <div className="flex flex-col gap-3 py-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <input ref={libraryRef} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />

      <button onClick={() => cameraRef.current?.click()}
        className="rounded-xl py-10 text-lg font-bold"
        style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
        📷 Take photo
      </button>
      <button onClick={() => libraryRef.current?.click()} className="text-sm underline"
        style={{ color: 'var(--color-ink-muted)' }}>
        Upload from library / files (images & PDF) — or drag & drop / ⌘V
      </button>

      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <div key={i} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
              style={{ background: 'var(--color-surface-2)' }}>
              {f.kind === 'pdf'
                ? <span className="flex h-full items-center justify-center text-xs">PDF</span>
                : <img src={URL.createObjectURL(f.thumb ?? f.full)} className="h-full w-full object-cover" alt="" />}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 px-1 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
      <input list="merchants" placeholder="Merchant" value={merchant}
        onChange={(e) => setMerchant(e.target.value)} className="field" />
      <datalist id="merchants">{merchants.map((m) => <option key={m} value={m} />)}</datalist>
      <input inputMode="decimal" placeholder="Total (incl. GST)" value={total}
        onChange={(e) => { setTotal(e.target.value); setGstOverride(null); }} className="field" />

      {space === 'company' && totalCents !== null && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          <span>GST {formatNZD(gstCents)}</span>
          <button onClick={() => setGstOverride(gstOverride === 0 ? null : 0)} className="underline">
            {gstOverride === 0 ? 'GST auto' : 'No GST'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={category === c
              ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
              : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }}>
            {c}
          </button>
        ))}
      </div>

      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="field" />
      <button disabled={!canSave} onClick={() => void handleSave()}
        className="rounded-xl py-3 font-bold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}>
        Save
      </button>
    </div>
  );
}
```

`src/index.css` 追加共享样式：

```css
.field {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  width: 100%;
}
```

- [ ] **Step 2: 手动验证**

```bash
npm run dev
```

桌面浏览器：拖一张图进窗口 → 缩略图出现；⌘V 粘贴截图 → 缩略图出现；填表保存 → 跳转 Receipts；PDF >20MB 报错提示。

- [ ] **Step 3: 提交**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat: capture screen with camera, library, pdf, drag-drop, paste"
```

---

### Task 14: ReceiptsScreen + ReceiptDetail —— 列表/搜索/编辑/删除

**Files:**
- Create: `src/ui/ReceiptsScreen.tsx`, `src/ui/ReceiptDetail.tsx`

- [ ] **Step 1: ReceiptsScreen.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { buildIndex, searchReceipts } from '../data/search';
import { formatNZD } from '../lib/money';
import type { Receipt, Space } from '../data/types';
import { ReceiptDetail } from './ReceiptDetail';

export function ReceiptsScreen({ space }: { space: Space }) {
  const [all, setAll] = useState<Receipt[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Space | 'all'>(space);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => setScope(space), [space]);
  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe((rs) =>
      setAll(rs.filter((r) => !r.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))),
    );
    return () => sub.unsubscribe();
  }, []);

  const index = useMemo(() => buildIndex(all), [all]);
  const visible = useMemo(() => {
    const scoped = scope === 'all' ? all : all.filter((r) => r.space === scope);
    if (!query.trim()) return scoped;
    const ids = new Set(searchReceipts(index, query));
    return scoped.filter((r) => ids.has(r.id));
  }, [all, scope, query, index]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, Receipt[]>();
    for (const r of visible) {
      const k = r.date.slice(0, 7);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()];
  }, [visible]);

  if (openId) return <ReceiptDetail id={openId} onClose={() => setOpenId(null)} />;

  return (
    <div className="flex flex-col gap-2 py-2">
      <input placeholder="⌕ Search merchant, note, amount…" value={query}
        onChange={(e) => setQuery(e.target.value)} className="field" />
      <div className="flex gap-3 text-xs font-semibold">
        {([space, 'all'] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} className="capitalize underline-offset-4"
            style={{ color: scope === s ? 'var(--color-accent)' : 'var(--color-ink-muted)' }}>
            {s}
          </button>
        ))}
      </div>
      {byMonth.map(([month, recs]) => (
        <section key={month}>
          <h3 className="py-1 text-[10px] font-bold tracking-widest"
            style={{ color: 'var(--color-ink-muted)' }}>{month}</h3>
          {recs.map((r) => (
            <button key={r.id} onClick={() => setOpenId(r.id)}
              className="mb-1.5 flex w-full items-center justify-between rounded-xl p-3 text-left"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span>
                <span className="block text-sm font-semibold">{r.merchant}</span>
                <span className="block text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {r.date} · {r.category}{r.space === 'personal' ? ' · personal' : ''}
                </span>
              </span>
              <span className="text-right" style={{ fontFamily: 'var(--font-numeric)' }}>
                <span className="block text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
                  {formatNZD(r.totalCents)}
                </span>
                {r.space === 'company' && (
                  <span className="block text-[9px]" style={{ color: 'var(--color-ink-muted)' }}>
                    GST {formatNZD(r.gstCents)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      ))}
      {visible.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          No receipts{query ? ' matching search' : ' yet'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ReceiptDetail.tsx（大图、编辑、删除）**

```tsx
import { useEffect, useState } from 'react';
import { db, type PhotoRow } from '../data/db';
import { softDeleteReceipt, updateReceipt } from '../data/repo';
import { formatNZD, gstFromTotalCents, parseNZD } from '../lib/money';
import { getConfig } from '../lib/settings';
import type { Receipt } from '../data/types';

export function ReceiptDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    void db.receipts.get(id).then((r) => {
      if (!r) return;
      setReceipt(r);
      setMerchant(r.merchant);
      setTotal((r.totalCents / 100).toFixed(2));
      setDate(r.date);
      setCategory(r.category);
      setNote(r.note ?? '');
    });
    void db.photos.where('receiptId').equals(id).toArray().then(setPhotos);
  }, [id]);

  if (!receipt) return null;

  async function handleSave() {
    const totalCents = parseNZD(total);
    if (totalCents === null || !receipt) return;
    const gstCents = receipt.space === 'company' ? gstFromTotalCents(totalCents) : 0;
    await updateReceipt(id, { merchant, totalCents, gstCents, date, category, note: note || undefined });
    onClose();
  }

  async function handleDelete() {
    if (confirm('Delete this receipt?')) {
      await softDeleteReceipt(id);
      onClose();
    }
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      <button onClick={onClose} className="self-start text-sm underline">← Back</button>
      {photos.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-xl" style={{ background: 'var(--color-surface)' }}>
          {p.kind === 'pdf'
            ? <a className="block p-4 text-center underline" href={URL.createObjectURL(p.full)} target="_blank" rel="noreferrer">Open PDF</a>
            : <img src={URL.createObjectURL(p.full)} className="w-full" alt={receipt.merchant} />}
        </div>
      ))}
      {!editing ? (
        <>
          <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
            <p className="text-lg font-bold">{receipt.merchant}</p>
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>
              {formatNZD(receipt.totalCents)}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              {receipt.date} · {receipt.category} · {receipt.space}
              {receipt.space === 'company' && ` · GST ${formatNZD(receipt.gstCents)}`}
            </p>
            {receipt.note && <p className="mt-2 text-sm">{receipt.note}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="flex-1 rounded-xl py-2 font-semibold"
              style={{ background: 'var(--color-surface-2)' }}>Edit</button>
            <button onClick={() => void handleDelete()} className="flex-1 rounded-xl py-2 font-semibold"
              style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}>Delete</button>
          </div>
        </>
      ) : (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="field" />
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="field" />
          <div className="flex flex-wrap gap-2">
            {getConfig().categories[receipt.space].map((c) => (
              <button key={c} onClick={() => setCategory(c)} className="rounded-full px-3 py-1.5 text-xs"
                style={category === c
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                  : { background: 'var(--color-surface-2)' }}>{c}</button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="field" />
          <button onClick={() => void handleSave()} className="rounded-xl py-3 font-bold"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}>Save changes</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 手动验证 + 提交**

```bash
npm run dev   # 录两张票 → 列表分月显示 → 模糊搜索拼错商家名仍命中 → 编辑 → 删除消失
npx tsc --noEmit && git add -A && git commit -m "feat: receipts list with fuzzy search and detail edit/delete"
```

---

### Task 15: ExportScreen + SettingsScreen

**Files:**
- Create: `src/ui/ExportScreen.tsx`, `src/ui/SettingsScreen.tsx`

- [ ] **Step 1: ExportScreen.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { listReceipts } from '../data/repo';
import { receiptsToCsv, summarize } from '../lib/csv';
import { formatNZD } from '../lib/money';
import type { Receipt, Space } from '../data/types';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function preset(kind: 'thisMonth' | 'lastMonth' | 'last2Months'): { from: string; to: string } {
  const now = new Date();
  const first = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
  if (kind === 'thisMonth') return { from: iso(first(now.getUTCFullYear(), now.getUTCMonth())), to: iso(now) };
  if (kind === 'lastMonth')
    return {
      from: iso(first(now.getUTCFullYear(), now.getUTCMonth() - 1)),
      to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))),
    };
  return { from: iso(first(now.getUTCFullYear(), now.getUTCMonth() - 1)), to: iso(now) };
}

export function ExportScreen({ space }: { space: Space }) {
  const [{ from, to }, setRange] = useState(preset('last2Months'));
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    void listReceipts(space).then((rs) => setReceipts(rs.filter((r) => r.date >= from && r.date <= to)));
  }, [space, from, to]);

  const s = useMemo(() => summarize(receipts), [receipts]);

  function download() {
    const blob = new Blob([receiptsToCsv(receipts)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipthub-${space}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex gap-2 text-xs">
        {(['thisMonth', 'lastMonth', 'last2Months'] as const).map((k) => (
          <button key={k} onClick={() => setRange(preset(k))} className="rounded-full px-3 py-1.5"
            style={{ background: 'var(--color-surface-2)' }}>{k}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="date" value={from} onChange={(e) => setRange({ from: e.target.value, to })} className="field" />
        <input type="date" value={to} onChange={(e) => setRange({ from, to: e.target.value })} className="field" />
      </div>
      <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.count} receipts · {space}</p>
        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-numeric)' }}>{formatNZD(s.totalCents)}</p>
        {space === 'company' && (
          <p className="text-sm" style={{ color: 'var(--color-accent)' }}>
            GST {formatNZD(s.gstCents)} · Net {formatNZD(s.netCents)}
          </p>
        )}
        <ul className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          {Object.entries(s.byCategory).map(([c, cents]) => (
            <li key={c} className="flex justify-between"><span>{c}</span><span>{formatNZD(cents)}</span></li>
          ))}
        </ul>
      </div>
      <button onClick={download} disabled={s.count === 0} className="rounded-xl py-3 font-bold disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}>
        Download CSV
      </button>
    </div>
  );
}
```

- [ ] **Step 2: SettingsScreen.tsx**

```tsx
import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { clearPat, getConfig, setConfig, DATA_REPO } from '../lib/settings';
import { syncNow, useSyncStatus } from '../sync/useSync';
import type { Space } from '../data/types';

export function SettingsScreen({ onPatCleared }: { onPatCleared: () => void }) {
  const { status, pending } = useSyncStatus();
  const [counts, setCounts] = useState({ receipts: 0, photos: 0 });
  const [config, setLocalConfig] = useState(getConfig());
  const [newCat, setNewCat] = useState('');
  const [catSpace, setCatSpace] = useState<Space>('company');

  useEffect(() => {
    void Promise.all([db.receipts.count(), db.photos.count()]).then(([receipts, photos]) =>
      setCounts({ receipts, photos }),
    );
  }, []);

  function addCategory() {
    if (!newCat.trim()) return;
    const next = { categories: { ...config.categories, [catSpace]: [...config.categories[catSpace], newCat.trim()] } };
    setConfig(next); setLocalConfig(next); setNewCat('');
  }
  function removeCategory(space: Space, cat: string) {
    const next = { categories: { ...config.categories, [space]: config.categories[space].filter((c) => c !== cat) } };
    setConfig(next); setLocalConfig(next);
  }

  return (
    <div className="flex flex-col gap-4 py-2 text-sm">
      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Sync</h3>
        <p style={{ color: 'var(--color-ink-muted)' }}>
          {status} · {pending} pending · {counts.receipts} receipts · {counts.photos} photos ·{' '}
          <a className="underline" href={`https://github.com/${DATA_REPO}`} target="_blank" rel="noreferrer">data repo</a>
        </p>
        <button onClick={() => void syncNow()} className="mt-2 rounded-lg px-3 py-1.5"
          style={{ background: 'var(--color-surface-2)' }}>Sync now</button>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Categories</h3>
        {(['company', 'personal'] as const).map((sp) => (
          <div key={sp} className="mt-2">
            <p className="text-xs capitalize" style={{ color: 'var(--color-ink-muted)' }}>{sp}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {config.categories[sp].map((c) => (
                <span key={c} className="rounded-full px-2.5 py-1 text-xs" style={{ background: 'var(--color-surface-2)' }}>
                  {c} <button onClick={() => removeCategory(sp, c)}>✕</button>
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <select value={catSpace} onChange={(e) => setCatSpace(e.target.value as Space)} className="field w-auto">
            <option value="company">company</option><option value="personal">personal</option>
          </select>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="field" />
          <button onClick={addCategory} className="rounded-lg px-3" style={{ background: 'var(--color-surface-2)' }}>Add</button>
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--color-surface)' }}>
        <h3 className="font-bold">Access</h3>
        <button onClick={() => { clearPat(); onPatCleared(); }} className="mt-2 rounded-lg px-3 py-1.5"
          style={{ color: 'var(--color-danger)', background: 'var(--color-surface-2)' }}>
          Clear PAT & lock
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 手动验证 + 全量回归 + 提交**

```bash
npm run dev   # Export: 汇总数字正确、CSV 下载打开核对；Settings: 加删分类、Clear PAT 回锁屏
npx vitest run && npx tsc --noEmit && npx prettier --check src
git add -A && git commit -m "feat: export screen with gst summary and settings screen"
```

---

### Task 16: 视觉方向应用 —— **BLOCKED: 等用户三选一**

**Files:**
- Modify: `src/theme/tokens.css`

- [ ] **Step 1: 用户选定方向后，替换 tokens.css 的值**

A·Ink & Paper：`--color-bg:#faf6ee; --color-surface:#f3edde; --color-ink:#1c1a16; --color-ink-muted:#9a917e; --color-accent:#1c1a16; --color-accent-ink:#faf6ee; --color-border:#d8d0bd; --font-display:Georgia,serif;`
B·Midnight Ledger：保持 Task 1 的默认值（即 B）。
C·Kiwi Minimal：`--color-bg:#ffffff; --color-surface:#f8faf9; --color-surface-2:#f2f5f4; --color-ink:#10201c; --color-ink-muted:#9aa6a2; --color-accent:#0f766e; --color-accent-ink:#ffffff; --color-border:#e5eae8; --font-display:'Helvetica Neue',-apple-system,sans-serif;`

- [ ] **Step 2: 微调间距/字重对齐所选方向的 mockup，手动过四屏**

- [ ] **Step 3: Commit**

```bash
git add src/theme && git commit -m "style: apply chosen visual direction tokens"
```

---

### Task 17: Playwright e2e（mock GitHub API）

**Files:**
- Create: `playwright.config.ts`, `e2e/core-flow.spec.ts`

- [ ] **Step 1: playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/ReceiptHub/' },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true },
});
```

- [ ] **Step 2: e2e/core-flow.spec.ts**

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Mock GitHub API：内存仓库
  const store = new Map<string, { content: string; sha: number }>();
  await page.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/\/contents\/(.+)$/);
    const path = m ? decodeURIComponent(m[1]) : '';
    if (route.request().method() === 'GET') {
      const f = store.get(path);
      if (f) return route.fulfill({ json: { content: f.content, sha: String(f.sha), path } });
      const children = [...store.keys()].filter((k) => k.startsWith(path + '/'));
      if (children.length)
        return route.fulfill({ json: children.map((k) => ({ path: k, sha: String(store.get(k)!.sha) })) });
      return route.fulfill({ status: 404, json: { message: 'Not Found' } });
    }
    const body = route.request().postDataJSON() as { content: string; sha?: string };
    const cur = store.get(path);
    if (cur && body.sha !== String(cur.sha)) return route.fulfill({ status: 409, json: {} });
    const sha = (cur?.sha ?? 0) + 1;
    store.set(path, { content: body.content, sha });
    return route.fulfill({ json: { content: { sha: String(sha) } } });
  });
  await page.goto('/');
  await page.getByPlaceholder('github_pat_…').fill('github_pat_test');
  await page.getByRole('button', { name: 'Unlock' }).click();
});

test('capture → list → search → export', async ({ page }) => {
  // 上传一张图（用文件 chooser 的 library 入口）
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (await chooser).setFiles({
    name: 'receipt.png', mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByPlaceholder('Merchant').fill('Bunnings Warehouse');
  await page.getByPlaceholder('Total (incl. GST)').fill('184.50');
  await expect(page.getByText('GST $24.07')).toBeVisible();
  await page.getByRole('button', { name: 'Equipment' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 列表 + 模糊搜索
  await expect(page.getByText('Bunnings Warehouse')).toBeVisible();
  await page.getByPlaceholder(/Search merchant/).fill('bunings'); // 故意拼错
  await expect(page.getByText('Bunnings Warehouse')).toBeVisible();

  // 导出
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('1 receipts · company')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toContain('receipthub-company');
});

test('offline capture queues, sync drains outbox', async ({ page, context }) => {
  await context.setOffline(true);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (await chooser).setFiles({
    name: 'r.png', mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByPlaceholder('Merchant').fill('Offline Cafe');
  await page.getByPlaceholder('Total (incl. GST)').fill('12.00');
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Offline Cafe')).toBeVisible(); // 本地立即可见
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/0 pending/)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: 跑通**

```bash
npx playwright install chromium
npx playwright test
```

Expected: 2 passed。失败则修实现（不改测试意图）。

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e && git commit -m "test: e2e core flow and offline sync with mocked github api"
```

---

### Task 18: 建远程仓库 —— **BLOCKED: 需用户 `gh auth login` 切到 WilsonZheng**

- [ ] **Step 1: 确认账号**

```bash
gh auth status   # 必须显示 active account: WilsonZheng
```

- [ ] **Step 2: 建应用仓库并推送**

```bash
cd /Users/wzheng/sandbox/ReceiptHub
gh repo create WilsonZheng/ReceiptHub --public --source . --push
```

- [ ] **Step 3: 建私有数据仓库并播种**

```bash
gh repo create WilsonZheng/ReceiptHub-data --private
tmp=$(mktemp -d) && cd $tmp && git init -b main
mkdir meta && cat > meta/config.json << 'EOF'
{
  "categories": {
    "company": ["Office Supplies", "Software & SaaS", "Fuel", "Parking", "Meals & Entertainment", "Travel", "Equipment", "Other"],
    "personal": ["Groceries", "Dining", "Transport", "Utilities", "Health", "Other"]
  }
}
EOF
git add -A && git commit -m "chore: seed config" 
git remote add origin https://github.com/WilsonZheng/ReceiptHub-data.git && git push -u origin main
```

- [ ] **Step 4: 用户创建 fine-grained PAT**（GitHub → Settings → Developer settings → Fine-grained tokens：Repository access = 只选 `ReceiptHub-data`，Permissions = Contents Read/Write，有效期 1 年）——粘贴进应用锁屏即完成"验证"配置。

---

### Task 19: CI + GitHub Pages 部署 —— **BLOCKED: 依赖 Task 18**

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

- [ ] **Step 1: ci.yml**

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx prettier --check src
      - run: npx vitest run
      - run: npx playwright install chromium --with-deps
      - run: npx playwright test
      - run: npm run build
```

- [ ] **Step 2: deploy.yml**

```yaml
name: Deploy Pages
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: 启用 Pages（Actions 源）并验证**

```bash
gh api -X POST repos/WilsonZheng/ReceiptHub/pages -f build_type=workflow 2>/dev/null || true
git add .github && git commit -m "ci: test pipeline and pages deploy" && git push
gh run watch && gh pr checks 2>/dev/null; echo "open https://wilsonzheng.github.io/ReceiptHub/"
```

- [ ] **Step 4: iPhone 实机验收**：Safari 打开 → 粘贴 PAT 解锁 → 分享菜单"添加到主屏幕" → 从主屏打开拍一张真实收据 → 桌面浏览器打开同一 URL 粘贴 PAT → 确认数据同步过来。

---

### Task 20: PWA 图标与 iOS 收尾

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`
- Modify: `index.html`

- [ ] **Step 1: 生成图标**（任意工具/脚本生成纯色底 "R" 字图标三种尺寸，180/192/512）

- [ ] **Step 2: index.html 加 iOS meta**

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<link rel="apple-touch-icon" href="/ReceiptHub/icons/apple-touch-icon.png" />
<title>ReceiptHub</title>
```

- [ ] **Step 3: 验证 + 提交 + 推送**

```bash
npm run build && npx tsc --noEmit
git add -A && git commit -m "feat: pwa icons and ios meta" && git push
```

---

## Self-Review 结果

- **Spec 覆盖**：拍照/相册/PDF/拖拽/粘贴（T13）✓ 原件保留（T6/T9 photos 不可变上传）✓ 双空间（T3/T11）✓ GST 3/23（T2）✓ 模糊搜索（T7/T14）✓ CSV+汇总（T5/T15）✓ PAT 验证（T11）✓ 同步/冲突/墓碑（T4/T9）✓ PWA/iOS（T1/T20）✓ CI/部署（T19）✓ tokens 晚绑定（T1/T16）✓
- **缺口（有意延后）**：原图 LRU 缓存淘汰（spec §9）——v1 数据量小，defer；`meta/config.json` 云端同步分类（v1 分类只存 localStorage）——defer，spec §5 初始值已播种到数据仓库供未来使用。
- **类型一致性**：`GithubClient.putRaw/putFile/getFile/listDir` 签名在 T8/T9/T12 一致；`ProcessedFile` 在 T10/T13 一致；`Tab`/`Space` 贯穿一致。
