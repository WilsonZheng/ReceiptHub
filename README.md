# ReceiptHub

自用 invoice/receipt 管理 PWA。拍照/上传 → **Gemini AI 一键识别填表** → 私有 GitHub 仓库同步。NZ GST 自动计算与进销项对账，公司/个人双空间，中英双语，深浅双主题。**零后端，$0/月。**

**App:** https://wilsonzheng.github.io/ReceiptHub/ · **数据:** [`ReceiptHub-data`](https://github.com/WilsonZheng/ReceiptHub-data)（private）

## 功能

- 📷 **录入**：拍照 / 相册多选 / PDF / 桌面拖拽 / ⌘V 粘贴；iOS「浏览」可直取 Google Drive 等云盘
- ✨ **AI 识别**（Gemini 免费层）：商家、日期、金额、收支、分类、商品明细、备注一键填好，多页票据合并识别
- 📝 **草稿**：录到一半切页不丢（含照片），可一键丢弃
- 💰 **收支双轨**：收入/支出独立分类体系（公司/个人 × 收/支 四套，可自定义），`+`绿 `-`默认色区分
- 🔍 **全字段模糊搜索**：商家/商品/备注/分类（中英）/日期/金额/GST，容错拼写
- 📊 **统计仪表盘**：范围筛选（本月/近6月/今年/全部）、结余、月均、可点击趋势图、分类占比下钻
- 📤 **导出**：CSV（含 Items 列）+ GST 进销项净额（= 应缴 IRD 的数）
- 🌗 双主题 · 🌏 中英切换 · 📅 自绘本地化日历 · ↻ 下拉刷新 · 一键应用内更新

## 架构

```
PWA (React 19 + TS + Tailwind v4) ──→ IndexedDB（本地优先：搜索/列表零延迟，离线可用）
                                        └─ outbox ──→ GitHub Contents API ──→ ReceiptHub-data
                                                      （SHA 乐观锁 + LWW + 软删除墓碑）
AI: 浏览器直连 Gemini 2.5 Flash 免费层（CORS 实测可用），key 仅存本机
```

- **验证**：fine-grained PAT（只授权数据仓库）当"密码"粘贴解锁；锁屏不泄露任何机制信息
- **GST**：含税价 × 3/23 反推，四舍五入到分；可手动覆盖
- **照片**：canvas 压缩 WebP（JPEG 兜底）+ 缩略图；PDF 原样保存（≤20MB）

## 开发

```bash
npm install
npm run dev          # 本地开发
npm test             # vitest 单元测试
npx vite build && npx playwright test   # e2e（preview 依赖 dist/）
npm run build        # tsc + vite build（CI 同款）
```

工程约定与踩坑知识见 **[CLAUDE.md](CLAUDE.md)**（iOS PWA 视口、时区、同步协议、e2e 陷阱等）。

## 首次配置

1. 创建 private 仓库 `ReceiptHub-data`（结构见 `scripts/bootstrap-remote.sh`）
2. GitHub → Settings → Developer settings → **Fine-grained tokens**：仅授权 `ReceiptHub-data`，Contents Read/Write
3. 打开应用，在"密码"框粘贴 token 解锁（每设备一次）
4. （可选，启用 AI）[aistudio.google.com/apikey](https://aistudio.google.com/apikey) 免费生成 key → 设置 → AI 识别
5. iPhone：Safari 分享菜单 →「添加到主屏幕」

## 文档

- 工程知识库：`CLAUDE.md`
- 设计规格：`docs/superpowers/specs/2026-06-07-receipthub-design.md`
- 实施计划（历史）：`docs/superpowers/plans/2026-06-07-receipthub.md`
