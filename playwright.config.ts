import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // 屏蔽 service worker：避免本地连跑两次测试时"更新横幅"弹出干扰 UI 断言
  use: { baseURL: 'http://localhost:4173/ReceiptHub/', serviceWorkers: 'block' },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
});
