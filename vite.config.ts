/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// 版本号 = 构建时刻 + 提交短哈希：设置页显示、更新后提示用。CI 里 GITHUB_SHA 优先
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: '/ReceiptHub/',
  define: {
    __APP_COMMIT__: JSON.stringify(commitSha()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // 应用内横幅提示更新，点击即切换——避免"杀两次进程"才见新版

      manifest: {
        name: 'ReceiptHub',
        short_name: 'ReceiptHub',
        description: 'Local-first receipt and invoice manager for NZ GST tracking.',
        id: '/ReceiptHub/',
        start_url: '/ReceiptHub/',
        scope: '/ReceiptHub/',
        display: 'standalone',
        background_color: '#050505',
        theme_color: '#050505',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node', // 纯逻辑测试用 Node 原生 Blob/fetch；UI 验证走 Playwright
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
