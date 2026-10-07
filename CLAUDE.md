# CLAUDE.md — ReceiptHub

自用 invoice/receipt 管理 PWA。React 19 + TS strict + Tailwind v4 + Dexie，托管 GitHub Pages，数据存私有仓库，AI 提取默认走 Mistral OCR、可切 Gemini。**$0/月，零后端。**

## 命令

```bash
npm run dev              # 本地开发
./scripts/verify.sh      # ★ 一键验证门（prettier→tsc→vitest→build→playwright，与 CI 一致，须见 ALL GREEN）
npm run build            # tsc --noEmit && vite build（CI 同款）
npx vitest run           # 单元测试（node 环境，fake-indexeddb）
npx playwright test      # e2e（自动起 preview 服务器，需先 build 产出 dist/）
npx prettier --write src e2e
```

## AI 协作基础设施

- **`AGENTS.md`**：跨工具 agent 入口（硬规则摘要），`.github/copilot-instructions.md` 同向指引——两者都指回本文件为深度知识库；规则有变三处同步
- **`scripts/verify.sh`**：唯一验证门，提交前必须 ALL GREEN
- **PR 模板**强制贴 verify 输出；**Issue 表单**带验收标准字段（AI 可直接领取实现）
- **Dependabot** 周更 npm（minor/patch 合组）+ 月更 Actions，CI 守门
- **`public/llms.txt`**：线上站点的 AI 可读索引（llmstxt.org）

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
- GST 申报视角：销项（收入的 GST）− 进项（支出的 GST）= 应缴净额。统计页 GST 抵扣卡**跟随所选期间**；导出页同一算法。
- **期间模型**（`lib/periods.ts`）：月度/GST 期/财年/年度统一为"长 L 个月、在某月结束"，翻页 = 平移 k×L。财年 = 4/1–3/31；GST 期由税务页「你的情况」里的申报频率决定（`rh.gst.freq`：每月 / 每两月单数月结束 / 每两月双数月结束 / 每半年 3、9 月结束〔默认，年销售额 < $500,000 才可选〕）。NZ **没有一年一次的 GST 申报**，最长每半年；"一年一次"的是所得税。
- **IRD 截止日**：GST 期末次月 28 日，例外 3 月结束 → 5/7、11 月结束 → 次年 1/15；所得税（IR3/IR4，无税务代理）财年后 7/7。
- **myIR 申报栏位**（`lib/gst.ts`）：第 8/12 栏按 IRD 算法用**栏位总额 × 3/23**，不是逐张 GST 求和（会差几分）。无 GST 的收入 = 零税率（第 6 栏）；`Interest` 收入免税不计入；无 GST 的支出不进第 11 栏。不含调整项（第 9、13 栏）。
- **税务页**（`TaxScreen`，不用 AI，全是规则）：`lib/taxCalendar.ts` 按"你的情况"（`rh.tax.profile`：税务代理、预缴税、PAYE、Companies Office 年度申报月份）生成截止日——GST、所得税 IR4/IR3（无代理 7/7，有代理次年 3/31）、年终税（2/7 或 4/7）、预缴税（标准法 8/28、1/15、5/7；每半年报 GST 的只有 10/28、5/7）、PAYE（次月 20 日）、年度申报（申报月月底）。已完成存 `rh.tax.done`，核对过的票据提醒存 `rh.tax.ack`；`lib/taxState.ts` 带订阅，导航角标（逾期或 14 天内）和每页顶部横幅（逾期或 7 天内）同步刷新。App 关着时的提醒靠导出 `.ics` 进手机日历（提前 7 天和前一天 9 点）。指南文案在 `lib/taxGuides.ts`（`{ en, zh }` 成对），规则改动要和 `taxCalendar.ts` 一起改。
- 金额一律整数分（`totalCents`），显示层才格式化。
- **时区**：NZ=UTC+12，`toISOString().slice(0,10)` 每天上午给出昨天的日期——**严禁**。一律用 `lib/dates.ts` 的 `localToday()`。

## iOS PWA 踩坑实录（最贵的知识）

1. **底部视口不可信**（debug 了 5 轮的结论）：standalone 模式下 dvh、innerHeight、fixed inset、calc 补偿全都修不干净底部错位（Safari 内正常，仅 add-to-home-screen 异常）。**最终解法是产品级的：导航放顶部，底部只放可滚动内容。** 任何 iOS PWA 都别把关键 UI 锚在底部。
2. 输入框字号 <16px → iOS 聚焦时强制放大整页且不回弹。`.field` 必须 ≥16px。
3. 安全区：`viewport-fit=cover` 与 `env(safe-area-inset-*)` 必须配套；顶部 padding 挂在 `.app-shell` 上。
4. **原生 `<input type="date">` 的语言跟随 iOS 系统**，页面 lang 管不了——所以自绘了 `DateField`（底部抽屉日历，`lib/calendar.ts` 纯函数网格）。
5. PWA 更新：`registerType: 'prompt'`（autoUpdate 会在用户填表时突然 reload），逻辑在 `ui/useAppUpdate.ts`：**没有未保存内容**（拍照草稿 `isDraftDirty`、详情编辑中 `lib/busy.ts`）时，冷启动 5 秒内发现新版直接淡出套用、切到后台时套用；否则显示横幅，点一下淡出刷新（有草稿先 confirm）。当前 Tab/空间存 sessionStorage（`rh.ui`），刷新后回到原页面；刷新后顶部提示"已更新 · 版本"（`rh.version` 比对）。版本号 = 构建日期 + 提交短哈希（`vite.config.ts` 的 `define`，CI 用 `GITHUB_SHA`），设置页「关于」可手动检查更新。e2e 里 `serviceWorkers: 'block'`，真实更新流程要另起 preview 手测（先 build A、打开、再 build B、点检查更新）。
9. **不闪白**：`index.html` 首帧内联脚本按 `rh.theme` 设 `data-theme` 和 `<html>` 底色（`lib/theme.ts` 切换时同步）；冷启动画面 `apple-touch-startup-image` 只有像素尺寸与设备完全一致才生效，目前覆盖 440×956@3（6.9 英寸 Pro Max）和 402×874@3（6.3 英寸 Pro），深浅各一张，`node scripts/gen-icons.mjs` 生成。
10. 详情页支持**左边缘右滑返回**（起手 ≤28px、拖过 90px）：大屏 iPhone 单手够不到左上角返回键。拖动距离存在 ref 里，不能读 state（快速甩动时事件比渲染快）。
6. iOS 没有系统级下拉刷新（App.tsx 自实现，touch 事件 + 阻尼）；橡皮筋用 `overscroll-behavior` 锁。
7. Google Drive 上传无需任何代码：iOS 文件选择器的「浏览」= 系统 Files App，Drive/Dropbox 是其官方接入方。不要去接 Google Picker API。
8. **`backdrop-filter` 双重陷阱**：它让元素变成原子层叠上下文（内部 z-index 出不去，菜单会被后续内容盖住）且成为 `fixed` 后代的包含块（全屏遮罩缩成自身大小）。规则：毛玻璃只放在纯视觉壳上，绝对/固定定位的弹层（菜单、遮罩）必须挂在**无滤镜的外层**（见 TopNav 结构）。

## AI 提取（Mistral / Gemini）

- 提供商存 `rh.ai.provider`；Mistral / Gemini key 分别存 localStorage `rh.mistral` / `rh.gemini`。新用户默认 Mistral；没有 provider 标记但已有 `rh.gemini` 的旧用户继续走 Gemini。key 只进请求头、不进 URL。
- **Mistral（推荐）**：`POST /v1/chat/completions`，钉死模型 `ministral-14b-2512`（禁止 `latest`，会漂移到本层级用不了的模型）。图片走 base64 `image_url`、PDF 走 base64 `document_url`，全部附件（上限 4）放进**同一个请求**的 `messages[0].content`，模型自己跨页合并；结构化输出用 `response_format: json_schema` + `strict: true`。金额 schema 刻意用 decimal string（不用 JSON number），规避 strict constrained decoding 偶发的浮点无限展开/截断。
- **为什么不用 `/v1/ocr`（踩过的坑，别改回去）**：Mistral 免费订阅层**不包含任何 OCR 模型**。七个 `mistral-ocr-*` 全部在 `/v1/ocr` 上返回 429，`x-ratelimit-limit-req-minute: 0`。限额是**按模型**算的，0 的含义是"这个模型不在你的层级"，不是"你用超了"——Mistral 对此有两种表达：`mistral-large-latest` 给明确的 403 `This model is not available in your subscription tier`，其余给限额 0 的 429，后者极易误判成限流。免费层实测可用：`ministral-14b-2512`（每分钟 30 次）、`ministral-8b-2512`（188 次）、`ministral-3b-latest`（750 次）；不可用：`mistral-small` / `medium` / `magistral-small` / 全部 OCR。诊断方法是 curl 打一次看那个响应头。
- **Gemini（兼容选项）**：`gemini-2.5-flash`，图片/PDF 走 `inline_data`，多页合并进一个请求；请求体超过约 18.5MB 在客户端拒绝。浏览器 CORS 已实测支持。
- 两条路径共享结构化校验：日期正则、金额限幅、分类大小写归并或限长提名、items/note 截断；数字字符串金额也可容错解析。
- 429、408/425、5xx 和浏览器网络故障最多重试 3 次并尊重 `Retry-After`（最长等 10 秒）。错误分为 key / 限流 / 网络 / 文件请求 / 空识别 / 解析；**2xx 无内容不许再静默返回 `{}`**，错误响应也必须把服务端原话带进 `ExtractError.detail` 并显示出来。
- **浏览器读不到 Mistral 的限流头**：它的响应只有 `access-control-allow-origin: *`，没有 `Access-Control-Expose-Headers`，所以 `x-ratelimit-*` 和 `Retry-After` 在 fetch 里一律是 `null`——`retryDelay` 的 `Retry-After` 分支实际只在 curl/服务端场景生效，浏览器里永远走固定退避。响应体是唯一能读到的线索。
- **`/v1/models` 返回 200 不代表账号能用**：那个端点不受限流，它列出的模型包含你的层级根本调不动的。要判断某个模型能不能用，只能真打一次请求看 `x-ratelimit-limit-req-minute`。控制台的美元用量和限流是两块互不相干的表——花了 $0.04/$10 照样可能一次请求都发不出去。

## 前端约定

- **所有颜色/字体走 `src/theme/tokens.css` 的 CSS 变量**，组件禁止硬编码——视觉方向（当前 Midnight Ledger 深色 + iOS 分组浅色）整体可换。
- 动效统一 iOS 缓动 `cubic-bezier(.32,.72,0,1)`；按压 `:active scale(.96)`；尊重 `prefers-reduced-motion`。
- 次级动作一律 `.btn-secondary`（链接样文字在移动端突兀）。
- `.field` 定义在 `@layer` 之外，Tailwind v4 里无层样式优先于工具类——给输入框加 `pl-*`/`pr-*` 无效，内边距只能内联 `style`（`.btn-*`/`.panel` 在 components 层，工具类可覆盖）。
- i18n（`lib/i18n.ts`）：中英字典用 `Record<MsgKey, string>` 做**编译期完整性校验**——漏译直接编译失败。`html lang` 随语言切换（驱动原生控件）。
- 导航语义：空间（公司/个人）只由右上角全局开关控制；列表内的筛选是收支维度——**同一维度只在一个地方控制**。
- 收入显示 `+` 绿色，支出 `-` 默认色。
- 搜索（minisearch）索引：商家/items/备注/分类（**中英双语**）/日期/总额/GST。

## e2e 约定（Playwright）

- mock GitHub API 用 `page.route` 内存 Map（见 `mockGithub`）；mock Mistral/Gemini 同理。
- `getByRole` 的 `name` 默认**子串+大小写不敏感**；`exact: true` 则**大小写敏感**（曾因 'all'≠'All' 翻车）。Tab 按钮可访问名含 emoji 前缀（"📷 拍照"），中文断言时注意 strict mode 多元素冲突。
- 锁屏解锁 helper 直接填 PAT；测试值 `github_pat_test`。

## 文档

- 设计 spec：`docs/superpowers/specs/2026-06-07-receipthub-design.md`（含已实现后的演进，以本文件和 git history 为准）
- 实施计划（历史）：`docs/superpowers/plans/2026-06-07-receipthub.md`
- 一键重建远程：`scripts/bootstrap-remote.sh`；图标再生成：`node scripts/gen-icons.mjs`

## 设计上下文（impeccable）

设计决策的权威来源是根目录两份文件——做任何 UI 改动前先读：

- **`PRODUCT.md`**：战略层（register/用户/目的/品牌人格/反面参照/设计原则/无障碍）。
- **`DESIGN.md`**：视觉层（Google Stitch 格式：token frontmatter + 六段正文）；边车 `.impeccable/design.json` 承载色阶/动效/组件片段，供 impeccable live 面板渲染。

速记（细节以上述文件为准）：

- **Register = product**（工具服务于任务，非营销页）。人格 = **「Calm financial trust」**：可信、清晰、克制；第一要务是**让用户相信数字是对的**。
- **North Star =「Midnight Ledger」**：近纯黑底 + 唯一极光绿 `#00ff66`（仅用于主操作/选中态/正向金额）；金额一律 mono 字体 + 正负号 + 绿/红语义色；**结构靠 1px 发丝边框，不用阴影**；全站只有一处发光（主 CTA）+ 一处毛玻璃（顶部导航）。
- **四条反面参照（明确否决）**：企业记账臃肿（Xero/MYOB）、玩味消费金融（渐变/吉祥物/彩纸）、通用后台模板（Material/Bootstrap 卡片网格）、拟物收据（仿热敏纸/撕边/点阵字）。
- 无障碍目标 **WCAG AA**；收/支不可仅靠颜色区分（保留 `+`/`−` 号）。
- impeccable 已装为项目级 skill（`.claude/skills/impeccable/`）：UI 设计/评审/打磨任务会自动触发，或用 `/impeccable <command>`（critique/polish/shape/harden/typeset/live…）。`.impeccable/` 为其会话工作目录。
