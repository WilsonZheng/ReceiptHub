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
  await page.goto('/');
  await page.getByPlaceholder('github_pat_…').fill('github_pat_test');
  await page.getByRole('button', { name: 'Unlock' }).click();
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
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('1 receipts · company')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await downloadPromise).suggestedFilename()).toContain('receipthub-company');
});

test('detail edit and soft delete', async ({ page }) => {
  await addReceipt(page, 'Z Energy', '92.30', 'Fuel');
  await page.getByText('Z Energy').click();
  await expect(page.getByText('GST $12.04')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox').nth(1).fill('Z Energy Penrose');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Z Energy Penrose')).toBeVisible();

  page.on('dialog', (d) => void d.accept());
  await page.getByText('Z Energy Penrose').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No receipts yet')).toBeVisible();
});

test('offline capture queues, sync drains outbox when online', async ({ page, context }) => {
  await context.setOffline(true);
  await addReceipt(page, 'Offline Cafe', '12.00', 'Other');
  await expect(page.getByText('Offline Cafe')).toBeVisible(); // 本地立即可见
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/synced · 0 pending/)).toBeVisible({ timeout: 15_000 });
});

test('theme and language switching persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  // Playwright 默认模拟 prefers-color-scheme: light → 初始应为 light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByRole('button', { name: '票据' })).toBeVisible(); // tab 已切中文
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // 主题持久化
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible(); // 语言持久化
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
