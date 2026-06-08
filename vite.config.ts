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
