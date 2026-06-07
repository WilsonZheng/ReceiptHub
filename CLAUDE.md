# CLAUDE.md — ReceiptHub

自用 invoice/receipt 管理 PWA。React 19 + TS strict + Tailwind v4 + Dexie，托管 GitHub Pages，数据存私有仓库，AI 提取走 Gemini 免费层。**$0/月，零后端。**

## 命令

```bash
npm run dev              # 本地开发
npm run build            # tsc --noEmit && vite build（CI 同款）
npx vitest run           # 单元测试（node 环境，fake-indexeddb）
npx playwright test      # e2e（自动起 preview 服务器，需先 build 产出 dist/）
npx prettier --write src e2e
```

**验证纪律（有过翻车教训）：**
- 永远用**退出码**判断成败：`cmd > /dev/null 2>&1; echo $?`。曾经把 `tsc` 输出管道给 `tail -1` 看尾行，真实的类型错误被吞掉、坏代码推上 CI 才被抓住。
- Playwright 的 webServer 是 `npm run preview`，**依赖 dist/ 已存在**——本地碰巧有旧 dist 会假绿。改动后先 `npx vite build` 再跑 e2e（CI 已按此排序）。
- 提交前完整序列：`tsc` → `vitest` → `vite build` → `playwright` → `prettier --write`，全绿才 push。

## 部署

- push `main` → `.github/workflows/deploy.yml` → GitHub Pages：https://wilsonzheng.github.io/ReceiptHub/
- 验证上线：轮询首页 HTML 里 `index-*.js` 的指纹变化（比查 Actions 状态更真实）。
- **GITHUB_TOKEN 无法创建 Pages 站点**（创建需 admin 权限，`pages: write` 只能管部署）。站点已手动启用过一次；新仓库需在 Settings → Pages 选 GitHub Actions 源。
- 本机 git 走个人 SSH 别名 `git@github.com-personal:`（~/.ssh/config）；`~/.gitconfig` 的 includeIf 使 sandbox 下自动用个人邮箱。**本机 gh CLI 登录的是公司账号，不能用于 WilsonZheng 名下的 API 写操作**——需要 API 时只能让用户操作或用匿名只读。

## 架构与数据

```
UI 只读写 IndexedDB（Dexie 4 表：receipts/photos/outbox/kv）
  └─ outbox 后台推送 → GitHub Contents API（PAT）→ WilsonZheng/ReceiptHub-data（私有）
       personal|company/YYYY-MM.json（月度元数据） + photos/<rid>/<pid>.webp|pdf（不可变）
  └─ 拉取按月文件 SHA 增量
```

- **同步正确性三件套**：Contents API 的 SHA 即乐观锁（冲突→重 GET→合并→重试）；记录级 LWW（`updatedAt`）；**软删除墓碑**（`deleted: true`，防多设备复活）。
- 墓碑的代价：任何计数/统计/搜索都必须过滤 `!r.deleted`——曾因裸 `count()` 出过"删了还显示 1 张"的 bug。
- `Receipt.kind?: 'income'|'expense'`，缺省视为 expense（`kindOf()` 读取，兼容旧数据）。
- **分类存储恒为英文规范名**，中文只在显示层翻译（`lib/categories.ts`）——换语言数据不乱、CSV 对会计稳定。用户自建分类原样显示。
- 草稿（`lib/draft.ts`）是模块级内存单例：切 Tab 不丢（含照片 blob），刻意不持久化（blob 进不了 localStorage，半截草稿更糟）。

## 认证（用户明确拍板，勿改）

- **PAT 即密码**：锁屏只有一个"密码"框，填入的是 fine-grained PAT（仅授权 ReceiptHub-data 的 Contents R/W），明文存 localStorage。
- 用户先后**否决**了 OAuth+Worker 方案和密码加密 vault 方案——要简单。风险已知悉接受（设备锁屏即边界）。
- 锁屏 UI **禁止出现** GitHub/PAT/token/仓库名字样（防机制泄露），e2e 有断言守护。
- 自动安全扫描会对明文 PAT 报 HIGH——这是有意的已记录决策，不要"修复"。

## NZ 业务规则

- **GST 从含税价反推是 `total × 3/23`**，不是 ×0.15。四舍五入到分。个人空间恒为 0。
- GST 申报视角：销项（收入的 GST）− 进项（支出的 GST）= 应缴净额。仪表盘 GST 卡固定"本月+上月"（申报周期概念，不跟筛选走）。
- 金额一律整数分（`totalCents`），显示层才格式化。
- **时区**：NZ=UTC+12，`toISOString().slice(0,10)` 每天上午给出昨天的日期——**严禁**。一律用 `lib/dates.ts` 的 `localToday()`。

## iOS PWA 踩坑实录（最贵的知识）

1. **底部视口不可信**（debug 了 5 轮的结论）：standalone 模式下 dvh、innerHeight、fixed inset、calc 补偿全都修不干净底部错位（Safari 内正常，仅 add-to-home-screen 异常）。**最终解法是产品级的：导航放顶部，底部只放可滚动内容。** 任何 iOS PWA 都别把关键 UI 锚在底部。
2. 输入框字号 <16px → iOS 聚焦时强制放大整页且不回弹。`.field` 必须 ≥16px。
3. 安全区：`viewport-fit=cover` 与 `env(safe-area-inset-*)` 必须配套；顶部 padding 挂在 `.app-shell` 上。
4. **原生 `<input type="date">` 的语言跟随 iOS 系统**，页面 lang 管不了——所以自绘了 `DateField`（底部抽屉日历，`lib/calendar.ts` 纯函数网格）。
5. PWA 更新：`registerType: 'prompt'` + 应用内横幅一键刷新（autoUpdate 会在用户填表时突然 reload）。另有下拉刷新手势触发 sync + SW update 检查。e2e 里 `serviceWorkers: 'block'` 防更新横幅干扰断言。
6. iOS 没有系统级下拉刷新（App.tsx 自实现，touch 事件 + 阻尼）；橡皮筋用 `overscroll-behavior` 锁。
7. Google Drive 上传无需任何代码：iOS 文件选择器的「浏览」= 系统 Files App，Drive/Dropbox 是其官方接入方。不要去接 Google Picker API。
8. **`backdrop-filter` 双重陷阱**：它让元素变成原子层叠上下文（内部 z-index 出不去，菜单会被后续内容盖住）且成为 `fixed` 后代的包含块（全屏遮罩缩成自身大小）。规则：毛玻璃只放在纯视觉壳上，绝对/固定定位的弹层（菜单、遮罩）必须挂在**无滤镜的外层**（见 TopNav 结构）。

## AI 提取（Gemini）

- 模型 `gemini-2.5-flash`，免费层 1,500 次/天。key 存 localStorage `rh.gemini`，走 `x-goog-api-key` 请求头（不进 URL）。
- **重要事实：博客普遍声称 Gemini API 不支持浏览器 CORS——实测是错的**（OPTIONS 预检返回 allow-origin）。GitHub Models 同样支持 CORS 但 50 次/天且不支持 PDF，作备选。
- 图片与 PDF 走同一 `inline_data` 通道（这是选 Gemini 的核心原因）；多张照片 = 同一票据的多页，合并进一个请求（上限 4）。
- 结构化输出用 `response_schema` + temperature 0；**服务端输出零信任**：日期正则校验、金额限幅、分类必须在用户列表内否则丢弃、items 截断。
- 错误分四档面向用户：key 无效 / 429 限流 / 网络 / 其他。

## 前端约定

- **所有颜色/字体走 `src/theme/tokens.css` 的 CSS 变量**，组件禁止硬编码——视觉方向（当前 Midnight Ledger 深色 + iOS 分组浅色）整体可换。
- 动效统一 iOS 缓动 `cubic-bezier(.32,.72,0,1)`；按压 `:active scale(.96)`；尊重 `prefers-reduced-motion`。
- 次级动作一律 `.btn-secondary`（链接样文字在移动端突兀）。
- i18n（`lib/i18n.ts`）：中英字典用 `Record<MsgKey, string>` 做**编译期完整性校验**——漏译直接编译失败。`html lang` 随语言切换（驱动原生控件）。
- 导航语义：空间（公司/个人）只由右上角全局开关控制；列表内的筛选是收支维度——**同一维度只在一个地方控制**。
- 收入显示 `+` 绿色，支出 `-` 默认色。
- 搜索（minisearch）索引：商家/items/备注/分类（**中英双语**）/日期/总额/GST。

## e2e 约定（Playwright）

- mock GitHub API 用 `page.route` 内存 Map（见 `mockGithub`）；mock Gemini 同理。
- `getByRole` 的 `name` 默认**子串+大小写不敏感**；`exact: true` 则**大小写敏感**（曾因 'all'≠'All' 翻车）。Tab 按钮可访问名含 emoji 前缀（"📷 拍照"），中文断言时注意 strict mode 多元素冲突。
- 锁屏解锁 helper 直接填 PAT；测试值 `github_pat_test`。

## 文档

- 设计 spec：`docs/superpowers/specs/2026-06-07-receipthub-design.md`（含已实现后的演进，以本文件和 git history 为准）
- 实施计划（历史）：`docs/superpowers/plans/2026-06-07-receipthub.md`
- 一键重建远程：`scripts/bootstrap-remote.sh`；图标再生成：`node scripts/gen-icons.mjs`
