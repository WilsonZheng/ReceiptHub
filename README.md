# ReceiptHub

自用 invoice/receipt 管理 PWA。拍照/上传录入，NZ GST 自动计算，公司/个人双空间，模糊搜索，CSV 导出。数据存自己的 GitHub 私有仓库——零服务器、零月费。

**App:** https://wilsonzheng.github.io/ReceiptHub/ · **数据:** [`ReceiptHub-data`](https://github.com/WilsonZheng/ReceiptHub-data)（private）

## 架构

```
PWA (React) ──读写──> IndexedDB（本地优先：搜索/列表零延迟，离线可用）
                         └─ outbox ──后台同步──> GitHub Contents API ──> ReceiptHub-data
                                                  （SHA 乐观锁 + LWW 合并 + 软删除墓碑）
```

- **验证**：fine-grained PAT（只授权数据仓库），存 localStorage；锁屏只显示一个"密码"框，不泄露认证机制——填入的"密码"实际就是 PAT
- **照片**：canvas 压缩 WebP（Safari 旧版 JPEG 兜底）+ 300px 缩略图；PDF 原样保存（≤20MB）
- **GST**：含税价 × 3/23，四舍五入到分；可手动覆盖/置零
- **主题**：`src/theme/tokens.css` 单点切换视觉方向

## 开发

```bash
npm install
npm run dev          # 本地开发
npm test             # vitest 单元测试
npx playwright test  # e2e（mock GitHub API）
npm run build        # tsc + vite build
```

## 首次配置

1. 创建 private 仓库 `ReceiptHub-data`
2. GitHub → Settings → Developer settings → **Fine-grained tokens**：
   - Repository access：只选 `ReceiptHub-data`
   - Permissions：Contents → **Read and write**
3. 打开应用，在"密码"框里粘贴 token 解锁（每设备一次）
4. iPhone：Safari 分享菜单 →「添加到主屏幕」

## 文档

- 设计规格：`docs/superpowers/specs/2026-06-07-receipthub-design.md`
- 实施计划：`docs/superpowers/plans/2026-06-07-receipthub.md`
