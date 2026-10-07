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
  await page.getByPlaceholder('Merchant', { exact: true }).fill(merchant);
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
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Bunnings Warehouse');
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
  await expect(page.getByText('$12.04', { exact: true })).toBeVisible(); // 详情页 GST 行
  // 返回键只有一个箭头图标，文案不再自带 "←"
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Z Energy Penrose');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Z Energy Penrose')).toBeVisible();

  await page.getByText('Z Energy Penrose').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); // 露出就地确认
  await page.getByRole('button', { name: 'Confirm delete' }).click();
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
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  // 收入分类替换了支出分类
  await expect(page.getByRole('button', { name: 'Sales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fuel', exact: true })).not.toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'invoice.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Client Invoice');
  await page.getByPlaceholder('Total (incl. GST)').fill('230.00'); // 收入 GST 30.00
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 收入绿色 +，支出 −
  await expect(page.getByRole('button', { name: /Client Invoice/ })).toContainText('+$230.00');
  await expect(page.getByRole('button', { name: /Office Rent/ })).toContainText('-$115.00');
  // 收支筛选
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  await expect(page.getByText('Client Invoice')).toBeVisible();
  await expect(page.getByText('Office Rent')).not.toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText('Office Rent')).toBeVisible();

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
  await expect(page.getByText('GST offset')).toBeVisible();
  // 切到月度
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByText('Mitre 10')).toBeVisible();
  // 点击趋势柱聚焦当月 → 选中胶囊出现，再点 ✕ 清除
  // 趋势柱的可访问名是本地化月份（含金额），en-NZ 下为 "June 2026"
  const now = new Date();
  const monthName = new Intl.DateTimeFormat('en-NZ', { year: 'numeric', month: 'long' }).format(
    now,
  );
  await page.getByRole('button', { name: `${monthName}:` }).click();
  await expect(page.getByRole('button', { name: /✕/ })).toBeVisible();
  await page.getByRole('button', { name: /✕/ }).click();
  await expect(page.getByRole('button', { name: /✕/ })).not.toBeVisible();
  // 分类下钻：点 Equipment 行 → 展开商家构成
  await page.getByRole('button', { name: /Equipment/ }).click();
  await expect(page.getByText('— Mitre 10')).toBeVisible();
});

test('future-dated receipt still counted in all-time stats', async ({ page }) => {
  // 录一张下个月日期的票（票面日期晚于今天是常见情况，统计不得静默排除）
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Future Co');
  await page.getByPlaceholder('Total (incl. GST)').fill('29.99');
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await page.getByRole('button', { name: 'next month' }).click();
  await page.getByRole('button', { name: '15', exact: true }).first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.getByText('Expense (1)')).toBeVisible(); // 全部范围计入
  await expect(page.getByText('-$29.99').first()).toBeVisible();

  // 导出页默认"全部"，未来日期同样计入
  await openMore(page, 'Export');
  await expect(page.getByText('Expense (1)')).toBeVisible();
  // 切到"本月"应排除未来票据
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByText('Expense (0)')).toBeVisible();
});

test('capture draft survives tab switches and can be discarded', async ({ page }) => {
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Draft Cafe');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  // 切走再切回——草稿（含照片）完好
  await page.getByRole('button', { name: 'Receipts' }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByPlaceholder('Merchant', { exact: true })).toHaveValue('Draft Cafe');
  await expect(page.getByRole('button', { name: 'Preview photo' })).toBeVisible(); // 照片缩略图还在
  // 丢弃草稿
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByPlaceholder('Merchant', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview photo' })).not.toBeVisible();
});

test('Mistral AI extract: upload → structured extraction → form filled → save', async ({
  page,
}) => {
  await page.route('https://api.mistral.ai/v1/chat/completions', (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                merchant: 'Pak n Save',
                date: '2026-06-03',
                total: '57.80',
                kind: 'expense',
                category: 'Pet Supplies', // 不在默认分类表中，应被自动添加并选中
                items: ['Milk 2L ×2', 'Bread'],
                note: 'EFTPOS',
              }),
            },
          },
        ],
      },
    }),
  );
  await page.evaluate(() => {
    localStorage.setItem('rh.ai.provider', 'mistral');
    localStorage.setItem('rh.mistral', 'test-ai-key');
  });
  await page.reload();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });

  await page.getByRole('button', { name: 'AI fill' }).click();
  // 表单被自动填入
  await expect(page.getByPlaceholder('Merchant', { exact: true })).toHaveValue('Pak n Save');
  await expect(page.getByPlaceholder('Total (incl. GST)')).toHaveValue('57.80');
  await expect(page.getByPlaceholder('Items (one per line, optional)')).toHaveValue(
    'Milk 2L ×2\nBread',
  );
  await expect(page.getByPlaceholder('Note (optional)')).toHaveValue('EFTPOS');
  // AI 提名的新分类被自动加入并选中
  await expect(page.getByRole('button', { name: 'Pet Supplies', exact: true })).toBeVisible();
  await expect(page.getByText('GST $7.54')).toBeVisible(); // 57.80 × 3/23
  // 直接保存即可入库
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Pak n Save')).toBeVisible();
  await expect(page.getByText('Milk 2L ×2 · Bread')).toBeVisible(); // 列表卡片显示 items
});

test('AI provider settings keep separate Mistral/Gemini keys and legacy Gemini users', async ({
  page,
}) => {
  await openMore(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Mistral', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByPlaceholder('Mistral API key').fill('mistral-test-key');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();

  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  await page.getByPlaceholder('Gemini API key').fill('gemini-test-key');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await page.getByRole('button', { name: 'Mistral', exact: true }).click();
  await expect(page.getByPlaceholder('Mistral API key')).toHaveValue('mistral-test-key');
  await expect(
    page.evaluate(() => ({
      provider: localStorage.getItem('rh.ai.provider'),
      mistral: localStorage.getItem('rh.mistral'),
      gemini: localStorage.getItem('rh.gemini'),
    })),
  ).resolves.toEqual({
    provider: 'mistral',
    mistral: 'mistral-test-key',
    gemini: 'gemini-test-key',
  });

  // 没有 provider 标记的旧用户仍自动使用原来的 rh.gemini key。
  await page.evaluate(() => {
    localStorage.removeItem('rh.ai.provider');
    localStorage.removeItem('rh.mistral');
  });
  await page.reload();
  await openMore(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Gemini', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByPlaceholder('Gemini API key')).toHaveValue('gemini-test-key');
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
  await page.getByRole('button', { name: 'Preview photo' }).click(); // 点缩略图
  const overlay = page.locator('.fixed.inset-0.z-50');
  await expect(overlay).toBeVisible();
  await overlay.click(); // 点任意处关闭
  await expect(overlay).not.toBeVisible();
});

test('take photo opens cropper and applies crop', async ({ page }) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo' }).click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('heading', { name: 'Crop photo' })).toBeVisible();
  await expect(page.locator('.crop-frame')).toBeVisible();
  await page.getByRole('button', { name: 'Apply crop' }).click();
  await expect(page.getByRole('heading', { name: 'Crop photo' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Crop photo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview photo' })).toBeVisible();
});

test('inline category add: tap + chip, type, enter — usable in capture', async ({ page }) => {
  await openMore(page, 'Settings');
  await page.getByRole('button', { name: '＋ Add' }).first().click(); // 公司·支出 组
  await page.getByPlaceholder('New category').fill('Insurance');
  await page.getByPlaceholder('New category').press('Enter');
  await expect(page.getByText('Insurance')).toBeVisible(); // chip 即时出现
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Insurance', exact: true })).toBeVisible();

  // 拍照页同样可就地添加并自动选中
  await page.getByRole('button', { name: '＋ Add' }).click();
  await page.getByPlaceholder('New category').fill('Gardening');
  await page.getByPlaceholder('New category').press('Enter');
  await expect(page.getByRole('button', { name: 'Gardening', exact: true })).toBeVisible();
});

test('custom category gets a per-language display name', async ({ page }) => {
  await openMore(page, 'Settings');
  // 英文界面下新增自定义分类（canonical key = "Insurance"）
  await page.getByRole('button', { name: '＋ Add' }).first().click(); // 公司·支出组
  await page.getByPlaceholder('New category').fill('Insurance');
  await page.getByPlaceholder('New category').press('Enter');
  await expect(page.getByText('Insurance')).toBeVisible();

  // 切到中文：自定义分类此时仍按 key 显示 "Insurance"
  await page.getByRole('button', { name: '中文' }).click();
  // 点该分类的"设置显示名"，填中文显示名
  await page.getByRole('button', { name: '设置显示名' }).first().click();
  await page.getByPlaceholder('中文显示名').fill('保险');
  await page.getByPlaceholder('中文显示名').press('Enter');
  await expect(page.getByText('保险')).toBeVisible();

  // 显示层译名应贯穿全站：拍照页分类按钮显示中文
  await page.getByRole('button', { name: '拍照' }).click();
  await expect(page.getByRole('button', { name: '保险', exact: true })).toBeVisible();

  // 切回英文：canonical key 不变，仍显示 "Insurance"（数据/CSV 稳定）
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('Insurance')).toBeVisible();
  await expect(page.getByText('保险')).toHaveCount(0);
});

test('space toggle separates company and personal', async ({ page }) => {
  await addReceipt(page, 'Company Store', '100.00', 'Other');
  // 切到 personal
  await page.getByRole('button', { name: 'personal' }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await addReceipt(page, 'Personal Shop', '50.00', 'Other');
  await expect(page.getByText('Personal Shop')).toBeVisible();
  await expect(page.getByText('Company Store')).not.toBeVisible(); // 列表严格跟随右上角空间
});

// 当前 NZ 财年（4/1–3/31）的名字，例如 "2026–27"
function fyNameOf(d: Date, shift = 0): string {
  const start = (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1) + shift;
  return `${start}–${String(start + 1).slice(2)}`;
}

test('stats: tax year stepper and GST offset follow the selected period', async ({ page }) => {
  await addReceipt(page, 'Office Rent', '115.00', 'Other'); // 进项 GST 15.00
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  await addReceipt(page, 'Client Invoice', '230.00', 'Sales'); // 销项 GST 30.00

  await page.getByRole('button', { name: 'Stats' }).click();
  await page.getByRole('button', { name: 'Tax year', exact: true }).click();
  const now = new Date();
  await expect(page.getByText(`Tax year ${fyNameOf(now)}`)).toBeVisible();
  // 销项 30 被进项 15 抵消一半，应缴 15
  await expect(page.getByText('GST you collected on income')).toBeVisible();
  await expect(page.getByText(/Offset by expense GST \$15\.00 · 50%/)).toBeVisible();
  await expect(page.getByText('GST to pay IRD')).toBeVisible();
  await expect(page.getByText(/Income tax return due 7 Jul/)).toBeVisible();

  // 上一财年：没有票据
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page.getByText(`Tax year ${fyNameOf(now, -1)}`)).toBeVisible();
  await expect(page.getByText('No GST in this period')).toBeVisible();
  // 点期间名回到当前
  await page.getByText('Back to current').click();
  await expect(page.getByText(`Tax year ${fyNameOf(now)}`)).toBeVisible();
  // 下一财年也能翻到
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByText(`Tax year ${fyNameOf(now, 1)}`)).toBeVisible();

  // GST 期：myIR 申报表各栏可照填
  await page.getByRole('button', { name: 'GST', exact: true }).click();
  await expect(page.getByText('myIR GST return')).toBeVisible();
  await expect(page.getByText(/Due \d+ \w+ \d{4}/)).toBeVisible();
  const box = (n: string) => page.getByText(new RegExp(`^Box ${n} ·`)).locator('..');
  await expect(box('5')).toContainText('$230.00');
  await expect(box('11')).toContainText('$115.00');
  await expect(box('15')).toContainText('$15.00');

  // 个人空间没有 GST 期
  await page.getByRole('button', { name: 'Personal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GST', exact: true })).not.toBeVisible();
});

test('detail edit keeps a no-GST receipt at zero GST', async ({ page }) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Upload from library').click();
  await (
    await chooserPromise
  ).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Merchant', { exact: true }).fill('Bank Fee');
  await page.getByPlaceholder('Total (incl. GST)').fill('10.00');
  await page.getByRole('button', { name: 'No GST' }).click();
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByText('Bank Fee').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('Merchant', { exact: true }).fill('ANZ Bank Fee');
  await page.getByRole('button', { name: 'Save changes' }).click();
  // 之前编辑会悄悄按 3/23 重算成 $1.30
  await expect(page.getByRole('button', { name: /ANZ Bank Fee/ })).toContainText('GST $0.00');
});

test('tax page: next deadline, reminders, done state, checks, guides', async ({ page }) => {
  // 固定到 2026-10-24：每半年 GST（4–9 月）10 月 28 日截止，还有 4 天
  await page.clock.setFixedTime(new Date('2026-10-24T10:00:00'));
  await page.reload();
  await addReceipt(page, 'Noel Leeming', '1899.00', 'Equipment'); // 超过 $1,000 → 核对发票抬头

  // 7 天内到期：每页顶部横幅 + 税务 Tab 角标
  await expect(page.getByText('File GST return and pay · Apr – Sep 2026')).toBeVisible();
  await expect(page.getByText('4 days left · View')).toBeVisible();
  await page.getByText('4 days left · View').click();

  // 下一件事
  await expect(page.getByText('Next up')).toBeVisible();
  await expect(page.getByText(/28 Oct 2026 · 4 days left/).first()).toBeVisible();
  await expect(
    page.getByText('From your receipts: nothing to pay, but you still need to file').first(),
  ).toBeVisible();
  // 票据检查
  await expect(
    page.getByText('Over $1,000: the invoice must show your company name'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Looks fine' }).click();
  await expect(page.getByText('Receipts to check')).not.toBeVisible();

  // 标记完成 → 横幅和角标消失，下一件事变成下一个截止日
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await expect(
    page.getByText('Pay the rest of the income tax · tax year 2025–26').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.getByText('4 days left · View')).not.toBeVisible();

  // 你的情况：需要预缴税 → 每半年 GST 下 10/28、5/7 两期
  await page.getByRole('button', { name: 'Tax', exact: true }).click();
  await page.getByRole('button', { name: 'Needed', exact: true }).click();
  // 同样 10/28 到期，GST 已完成，它成为"下一件事"，列表里也有一行
  await expect(page.getByText('Provisional tax instalment 1 of 2 · tax year 2026–27')).toHaveCount(
    2,
  );

  // 指南展开
  await page.getByRole('button', { name: /Companies Office annual return/ }).click();
  await expect(page.getByText(/Find your filing month/)).toBeVisible();

  // 导出日历
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add all to phone calendar' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('receipthub-tax-deadlines.ics');
});

test('settings shows the version and can check for updates; tab survives reload', async ({
  page,
}) => {
  await openMore(page, 'Settings');
  await expect(page.getByText(/^\d{4}\.\d{2}\.\d{2} · \w+$/)).toBeVisible(); // 版本号
  await page.getByRole('button', { name: 'Check for updates' }).click();
  // e2e 屏蔽了 service worker，检查结果应如实说明，而不是假装"已是最新"
  await expect(page.getByText('Update checks are not available here')).toBeVisible();

  // 刷新（例如更新后自动刷新）仍停在当前 Tab
  await page.getByRole('button', { name: 'Stats' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Stats' })).toHaveAttribute('aria-current', 'true');
});

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('swipe from the left edge goes back from a receipt', async ({ page }) => {
    await addReceipt(page, 'Swipe Cafe', '9.50', 'Other');
    await page.getByText('Swipe Cafe').click();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    // 模拟从左边缘 10px 处向右拖 200px
    await page.evaluate(() => {
      const target = document.querySelector('.push-in')!;
      const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 400 });
      const fire = (type: string, x: number) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' ? [] : [touch(x)],
            changedTouches: [touch(x)],
          }),
        );
      fire('touchstart', 10);
      for (const x of [30, 80, 140, 210]) fire('touchmove', x);
      fire('touchend', 210);
    });
    await expect(page.getByRole('button', { name: 'Back', exact: true })).not.toBeVisible();
    await expect(page.getByPlaceholder(/Search merchant/)).toBeVisible(); // 回到列表
  });
});
