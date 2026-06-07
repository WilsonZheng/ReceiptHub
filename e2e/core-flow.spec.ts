import { expect, test, type Page } from '@playwright/test';

// 1x1 透明 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function mockGithub(page: Page) {
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
        return route.fulfill({
          json: children.map((k) => ({ path: k, sha: String(store.get(k)!.sha) })),
        });
      return route.fulfill({ status: 404, json: { message: 'Not Found' } });
    }
    const body = route.request().postDataJSON() as { content: string; sha?: string };
    const cur = store.get(path);
    if (cur && body.sha !== String(cur.sha)) return route.fulfill({ status: 409, json: {} });
    const sha = (cur?.sha ?? 0) + 1;
    store.set(path, { content: body.content, sha });
    return route.fulfill({ json: { content: { sha: String(sha) } } });
  });
}

async function unlock(page: Page) {
  // "密码"框里粘的实际是 PAT——UI 不暴露这一点
  await page.goto('/');
  await page.getByPlaceholder('Password').fill('github_pat_test');
  await page.getByRole('button', { name: 'Unlock' }).click();
}

// Export/Settings 收在顶部 ⋯ 菜单里
async function openMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: item }).click(); // 菜单项名带 emoji 前缀，子串匹配
}

async function addReceipt(page: Page, merchant: string, total: string, category: string) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant').fill(merchant);
  await page.getByPlaceholder('Total (incl. GST)').fill(total);
  await page.getByRole('button', { name: category, exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await mockGithub(page);
  await unlock(page);
});

test('capture → list → fuzzy search → export csv', async ({ page }) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant').fill('Bunnings Warehouse');
  await page.getByPlaceholder('Total (incl. GST)').fill('184.50');
  await expect(page.getByText('GST $24.07')).toBeVisible(); // 3/23 实时计算
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 保存后跳转 Receipts，列表可见
  await expect(page.getByText('Bunnings Warehouse')).toBeVisible();

  // 模糊搜索：故意拼错
  await page.getByPlaceholder(/Search merchant/).fill('bunings');
  await expect(page.getByText('Bunnings Warehouse')).toBeVisible();
  await page.getByPlaceholder(/Search merchant/).fill('zzzznothing');
  await expect(page.getByText('No receipts matching search')).toBeVisible();
  await page.getByPlaceholder(/Search merchant/).clear();

  // 导出
  await openMore(page, 'Export');
  await expect(page.getByText('Expense (1)')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await downloadPromise).suggestedFilename()).toContain('receipthub-company');
});

test('detail edit and soft delete', async ({ page }) => {
  await addReceipt(page, 'Z Energy', '92.30', 'Fuel');
  await page.getByText('Z Energy').click();
  await expect(page.getByText('GST $12.04')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('Merchant').fill('Z Energy Penrose');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Z Energy Penrose')).toBeVisible();

  page.on('dialog', (d) => void d.accept());
  await page.getByText('Z Energy Penrose').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No receipts yet')).toBeVisible();

  // 删除后设置页计数应为 0（墓碑不计入）
  await openMore(page, 'Settings');
  await expect(page.getByText(/0 receipts · 0 photos/)).toBeVisible();
});

test('offline capture queues, sync drains outbox when online', async ({ page, context }) => {
  await context.setOffline(true);
  await addReceipt(page, 'Offline Cafe', '12.00', 'Other');
  await expect(page.getByText('Offline Cafe')).toBeVisible(); // 本地立即可见
  await context.setOffline(false);
  await openMore(page, 'Settings');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/synced · 0 pending/)).toBeVisible({ timeout: 15_000 });
});

test('lock screen shows only a password box and leaks no auth mechanism', async ({ page }) => {
  await openMore(page, 'Settings');
  await page.getByRole('button', { name: 'Clear credentials & lock' }).click();
  await expect(page.getByPlaceholder('Password')).toBeVisible();
  // 锁屏不得泄露认证机制（GitHub/PAT/token/数据仓库名）
  await expect(page.locator('body')).not.toContainText(
    /github|fine-grained|token|PAT|ReceiptHub-data/i,
  );
  await page.getByPlaceholder('Password').fill('github_pat_test');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible(); // 重新解锁成功
});

test('theme and language switching persists', async ({ page }) => {
  await openMore(page, 'Settings');
  // Playwright 默认模拟 prefers-color-scheme: light → 初始应为 light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByRole('button', { name: '票据' })).toBeVisible(); // tab 已切中文
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // 主题持久化
  await expect(page.getByRole('button', { name: '更多' })).toBeVisible(); // 语言持久化
});

test('income entry: own categories, + in list, gst nets off in export', async ({ page }) => {
  await addReceipt(page, 'Office Rent', '115.00', 'Other'); // 支出 GST 15.00
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  // 收入分类替换了支出分类
  await expect(page.getByRole('button', { name: 'Sales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fuel', exact: true })).not.toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'invoice.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant').fill('Client Invoice');
  await page.getByPlaceholder('Total (incl. GST)').fill('230.00'); // 收入 GST 30.00
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 列表里收入带 + 号
  await expect(page.getByText('+$230.00')).toBeVisible();

  // Export：进销项相抵，净额 = 30 - 15 = 15
  await openMore(page, 'Export');
  await expect(page.getByText('Income (1)')).toBeVisible();
  await expect(page.getByText(/Net GST \$15\.00/)).toBeVisible();

  // CSV 含 Kind 列
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const path = await (await downloadPromise).path();
  const fs = await import('node:fs');
  const csv = fs.readFileSync(path, 'utf8');
  expect(csv).toContain('Date,Kind,Merchant,Items,');
  expect(csv).toContain(',Income,Client Invoice,,Sales,200.00,30.00,230.00,');
  expect(csv).toContain(',Expense,Office Rent,,Other,100.00,15.00,115.00,');
});

test('dashboard: range filters, net balance, tappable trend, category drill-down', async ({
  page,
}) => {
  await addReceipt(page, 'Mitre 10', '46.00', 'Equipment'); // 支出 GST 6.00
  await page.getByRole('button', { name: 'Stats' }).click();
  // 默认"全部"范围
  await expect(page.getByText('Top categories')).toBeVisible();
  await expect(page.getByText('Net', { exact: true })).toBeVisible(); // 结余行
  await expect(page.getByText(/Net GST/)).toBeVisible();
  // 切到本月
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByText('Mitre 10')).toBeVisible();
  // 点击趋势柱聚焦当月 → 选中胶囊出现，再点 ✕ 清除
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await page.getByRole('button', { name: ym, exact: true }).click();
  await expect(page.getByRole('button', { name: /✕/ })).toBeVisible();
  await page.getByRole('button', { name: /✕/ }).click();
  await expect(page.getByRole('button', { name: /✕/ })).not.toBeVisible();
  // 分类下钻：点 Equipment 行 → 展开商家构成
  await page.getByRole('button', { name: /Equipment/ }).click();
  await expect(page.getByText('— Mitre 10')).toBeVisible();
});

test('capture draft survives tab switches and can be discarded', async ({ page }) => {
  await page.getByPlaceholder('Merchant').fill('Draft Cafe');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  // 切走再切回——草稿（含照片）完好
  await page.getByRole('button', { name: 'Receipts' }).click();
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(page.getByPlaceholder('Merchant')).toHaveValue('Draft Cafe');
  await expect(page.locator('[role="button"].h-16')).toBeVisible(); // 照片缩略图还在
  // 丢弃草稿
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByPlaceholder('Merchant')).toHaveValue('');
  await expect(page.locator('[role="button"].h-16')).not.toBeVisible();
});

test('ai extract: upload → button → form filled → save', async ({ page }) => {
  // mock Gemini：返回结构化提取结果
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      json: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    merchant: 'Pak n Save',
                    date: '2026-06-03',
                    total: 57.8,
                    kind: 'expense',
                    category: 'Other',
                    items: ['Milk 2L ×2', 'Bread'],
                    note: 'EFTPOS',
                  }),
                },
              ],
            },
          },
        ],
      },
    }),
  );
  await page.evaluate(() => localStorage.setItem('rh.gemini', 'test-ai-key'));
  await page.reload();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });

  await page.getByRole('button', { name: '✨ AI fill' }).click();
  // 表单被自动填入
  await expect(page.getByPlaceholder('Merchant')).toHaveValue('Pak n Save');
  await expect(page.getByPlaceholder('Total (incl. GST)')).toHaveValue('57.80');
  await expect(page.getByPlaceholder('Items (one per line, optional)')).toHaveValue(
    'Milk 2L ×2\nBread',
  );
  await expect(page.getByPlaceholder('Note (optional)')).toHaveValue('EFTPOS');
  await expect(page.getByText('GST $7.54')).toBeVisible(); // 57.80 × 3/23
  // 直接保存即可入库
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Pak n Save')).toBeVisible();
  await expect(page.getByText('Milk 2L ×2 · Bread')).toBeVisible(); // 列表卡片显示 items
});

test('custom localized date picker: sheet opens, pick a day, value updates', async ({ page }) => {
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  // 抽屉里有月份导航和今天按钮
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '15', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Today' })).not.toBeVisible(); // 选中即关闭
  await expect(page.getByRole('button', { name: 'Date', exact: true })).toContainText('15');
});

test('capture thumbnail opens fullscreen preview', async ({ page }) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('[role="button"].h-16').click(); // 点缩略图
  const overlay = page.locator('.fixed.inset-0.z-50');
  await expect(overlay).toBeVisible();
  await overlay.click(); // 点任意处关闭
  await expect(overlay).not.toBeVisible();
});

test('inline category add: tap + chip, type, enter — usable in capture', async ({ page }) => {
  await openMore(page, 'Settings');
  await page.getByRole('button', { name: '＋ Add' }).first().click(); // 公司·支出 组
  await page.getByPlaceholder('New category').fill('Insurance');
  await page.getByPlaceholder('New category').press('Enter');
  await expect(page.getByText('Insurance')).toBeVisible(); // chip 即时出现
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(page.getByRole('button', { name: 'Insurance', exact: true })).toBeVisible();
});

test('space toggle separates company and personal', async ({ page }) => {
  await addReceipt(page, 'Company Store', '100.00', 'Other');
  // 切到 personal
  await page.getByRole('button', { name: 'personal' }).click();
  await page.getByRole('button', { name: 'Capture' }).click();
  await addReceipt(page, 'Personal Shop', '50.00', 'Other');
  await expect(page.getByText('Personal Shop')).toBeVisible();
  await expect(page.getByText('Company Store')).not.toBeVisible();
  // all 范围两者都显示
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText('Company Store')).toBeVisible();
});
