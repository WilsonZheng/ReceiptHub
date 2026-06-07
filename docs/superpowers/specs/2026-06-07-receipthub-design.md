# ReceiptHub 设计文档

日期：2026-06-07
作者：Wilson Zheng（与 Claude 协作设计）
状态：✅ 已实现并上线（含 Phase 2 AI 提取）。后续演进以 `CLAUDE.md` 与 git history 为准；本文件保留为初始设计存档。

## 1. 目标

一个专属自用的 invoice/receipt 管理 PWA：

- iPhone 拍照即录入，保留原始照片/PDF
- 五字段手动录入（日期、商家、总额、分类、备注），公司票据自动算 NZ GST
- Personal / Company 双空间分离
- 模糊搜索（商家/备注/分类/金额）
- CSV 导出 + GST 汇总，方便交给会计做账
- 全部基础设施白嫖 GitHub：Pages 托管、私有仓库存数据、Actions 做 CI/CD
- 数据完全归自己所有，无第三方服务依赖

### 非目标（v1 不做，留给后续版本）

- AI 自动提取票据信息（Phase 2：浏览器直连 Claude API）
- GST101 申报表数字、Xero 直接导入格式
- 多用户、分享、协作
- 应用内 FaceID/口令锁（PAT 本身即访问门槛）
- 原件批量打包下载（v1.1 候选）

## 2. 账号与仓库

| 项 | 值 |
|---|---|
| GitHub 账号 | WilsonZheng（wilsonzhengnz@gmail.com，个人账号） |
| 应用仓库 | `WilsonZheng/ReceiptHub`（public——GitHub Pages 免费版要求） |
| 数据仓库 | `WilsonZheng/ReceiptHub-data`（private） |
| 部署地址 | `https://wilsonzheng.github.io/ReceiptHub/` |

前置条件：本机 `gh` CLI 当前登录的是公司账号（`wilson-zheng_idxx`），创建仓库前需 `gh auth login` 添加个人账号并切换。

## 3. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 构建 | Vite | 快、简单、PWA 插件成熟 |
| 框架 | React 19 + TypeScript (strict) | Wilson 主栈，长期维护成本最低 |
| 样式 | Tailwind CSS v4 + 自定义 design tokens | 现代化且可定制，避免组件库默认风 |
| 本地存储 | Dexie (IndexedDB) | 结构化查询 + 照片 blob 存储 |
| 模糊搜索 | minisearch | 轻量、容错拼写、前缀匹配，全部在内存 |
| ID | ulid | 时间有序，按月分桶天然排序 |
| PWA | vite-plugin-pwa (Workbox) | 离线 app shell + iOS 安装支持 |
| 测试 | Vitest + Playwright + MSW | 单元 + 端到端 + GitHub API mock |
| 质量 | ESLint + Prettier + `tsc --noEmit` | 全部进 CI |

不引入路由库（4 个 Tab 用状态切换即可）、不引入状态管理库（React 内置 + Dexie live query 足够）。架构尽量简单。

## 4. 架构总览

```
iPhone PWA / 桌面浏览器 (React)
┌─────────────────────────────┐
│ 拍照 → canvas 压缩 (WebP/JPEG) │
│   ↓                          │
│ IndexedDB (Dexie)            │ ← 列表/搜索/详情全部读本地 → 零延迟、离线可用
│   ├─ receipts 表             │
│   ├─ photos 表 (blob+缩略图)  │
│   └─ outbox 表 (待同步操作)    │
│   ↓ 后台同步（有网时）          │
└──────┬──────────────────────┘
       ↓ GitHub Contents API（fine-grained PAT）
┌─────────────────────────────┐
│ ReceiptHub-data (private)    │
│  meta/config.json            │ ← 分类列表、设置
│  personal/2026-06.json       │ ← 月度元数据（该月全部记录的数组）
│  company/2026-06.json        │
│  photos/<rid>/<pid>.webp     │ ← 压缩照片，写入后不可变
│  photos/<rid>/<pid>.pdf      │ ← PDF 原件原样保存
└─────────────────────────────┘
```

## 5. 数据模型

```ts
interface Receipt {
  id: string;                       // ULID
  space: 'personal' | 'company';
  date: string;                     // YYYY-MM-DD（票据日期）
  merchant: string;
  totalCents: number;               // NZD 含 GST，整数分
  gstCents: number;                 // 公司空间自动算，可手改；个人空间恒为 0
  category: string;
  note?: string;
  photos: { id: string; kind: 'webp' | 'jpeg' | 'pdf' }[];
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601，冲突合并依据
  deleted?: boolean;                // 软删除墓碑
}
```

### GST 计算（NZ）

- 含税价反推 GST：`gstCents = Math.round(totalCents * 3 / 23)`（15/115 约分为 3/23，四舍五入到分）
- 可手动覆盖（免 GST 供应商、海外购买等），表单提供 "No GST" 一键置零
- 个人空间不显示、不计算 GST

### 分类

每空间独立的分类列表，存 `meta/config.json`，Settings 可增删改。初始值：

- Company: Office Supplies / Software & SaaS / Fuel / Parking / Meals & Entertainment / Travel / Equipment / Other
- Personal: Groceries / Dining / Transport / Utilities / Health / Other

### 照片处理

- 三种录入来源，两个入口：
  1. **拍照**（主按钮）：`<input type="file" accept="image/*" capture="environment">`——`capture` 属性让 iOS 直接开相机
  2. **相册 / 文件上传**（次按钮）：`<input type="file" accept="image/*,application/pdf" multiple>`——不带 `capture`，iOS 弹出原生选择单（照片图库 / 拍照 / 浏览文件），支持多选补传历史截图和邮件里存的 PDF invoice
  3. **桌面增强**：同一个次按钮在桌面打开系统文件选择器；此外 Capture 屏整体作为拖拽落区（drag & drop 图片/PDF），并监听 `paste` 事件支持 ⌘V 直接粘贴截图——邮件里的 invoice 截个图粘进来就能录
- 压缩：canvas 缩到最长边 1600px，优先 `toBlob('image/webp', 0.8)`，Safari 不支持 WebP 编码时回退 JPEG 0.8，目标 ≤300KB
- 同时生成 300px 缩略图存 IndexedDB，列表只用缩略图
- PDF 不压缩原样存，>20MB 拒绝并提示
- 每条记录支持多张照片（长票据拍多张）

## 6. 同步协议

**原则：本地是事实来源的工作副本，GitHub 是持久化主库。所有 UI 读写只碰 IndexedDB。**

### 推送（outbox 模式）

1. 每次增删改：写 IndexedDB → 追加一条 outbox 操作
2. 有网时后台 flush outbox，顺序：先传照片（PUT，不可变，幂等），再更新月度 JSON
3. 月度 JSON 更新流程：GET 当前文件取 SHA → 本地合并 → PUT 带 SHA。SHA 冲突（409/422）→ 重新 GET → 合并 → 重试（指数退避，最多 5 次后留队提示）

### 拉取

- 打开应用 / 手动下拉刷新时：列出 `personal/`、`company/` 下月度文件，对比本地缓存的 SHA，只拉取变化的月份
- 照片按需拉取（查看详情时），拉取后缓存到 IndexedDB，LRU 淘汰原图缓存（缩略图永久保留）

### 冲突合并（iPhone + 桌面两设备场景）

- 按记录 `updatedAt` last-write-wins
- 删除用墓碑（`deleted: true`）而不是物理删除，避免"删了又复活"
- 同一记录两端并发编辑：晚者胜，不做字段级合并（单用户场景收益不值复杂度）

### 同步状态 UI

- 常驻小指示点：已同步 / n 条待同步 / 离线 / 错误
- 点击可看待同步队列和最近错误

## 7. 验证与安全

- 首次打开：锁屏页要求粘贴 fine-grained PAT（只授权 `ReceiptHub-data` 单仓库 Contents read/write），存 localStorage
- 无 token：只有锁屏页，本地无任何数据；知道 URL 的陌生人什么都看不到
- PAT 失效/过期（fine-grained 最长 1 年）：API 401 → 顶部横幅引导到 Settings 更新
- 应用代码公开但不含任何秘密；数据仓库 private
- 风险接受声明：PAT 存 localStorage，设备被解锁访问即等于数据被访问——自用场景接受，iPhone 本身有锁屏

## 8. 界面（4 屏 + 底部 Tab）

顶部全局 Personal | Company 分段切换，影响录入默认空间和列表过滤。

1. **Capture（默认屏）**：大拍照按钮 + 次级"从相册/文件上传"按钮（支持多选、支持 PDF）→ 照片预览（可加拍/加传）→ 五字段表单。桌面端额外支持拖拽文件进页面和 ⌘V 粘贴截图（日期默认今天；商家输入框带历史自动补全；金额数字键盘；分类 chips 单选；备注可选）→ 保存。公司空间下金额输入时实时显示 GST 金额。目标：一张票 10 秒内录完。
2. **Receipts**：按月分组的列表（缩略图 + 商家 + 日期 + 金额），顶部模糊搜索框（minisearch 索引商家/备注/分类/金额字符串），空间过滤继承全局切换（可切 All）。点击进详情：大图查看、编辑全部字段、删除。
3. **Export**：日期范围选择（快捷项：本月 / 上月 / 最近两月 / 自定义）→ 显示汇总卡（票据数、含税总额、GST 总额、净额，按分类小计）→ 下载 CSV。CSV 列：`Date, Merchant, Category, Net (NZD), GST (NZD), Total (NZD), Note, ReceiptID`。金额输出为带两位小数的元。
4. **Settings**：PAT 管理（更换/清除）、分类管理、同步状态详情、存储统计（本地缓存大小/云端照片数）、数据仓库链接。

### UI 设计原则

- 现代但不是"笼统 AI 风"：不用默认 shadcn 风格、不用千篇一律的紫色渐变 + 圆角卡片堆砌
- **结论（2026-06-07 用户选定）：B · Midnight Ledger**——即 `tokens.css` 当前值，无需改动
- 候选视觉方向（评审记录）：
  1. **Ink & Paper**——票据纸质感：暖白底、等宽数字、账本式行、高对比墨色
  2. **Midnight Ledger**——深色优先金融风：炭黑底、单一亮色点缀、玻璃质感卡片
  3. **Kiwi Minimal**——瑞士极简：大留白、利落字体层级、单一 NZ 青绿强调色
- 不论方向：60fps 滚动、列表虚拟化（量大时）、骨架屏、触觉友好的点击目标（≥44px）

## 9. 错误处理

| 场景 | 行为 |
|---|---|
| 同步失败（网络/5xx） | 留在 outbox，指数退避重试，指示点变橙 |
| SHA 冲突 | 自动重拉合并重试，对用户透明 |
| PAT 401/403 | 横幅提示 + 跳 Settings，本地功能不受影响 |
| 照片过大/格式不支持 | 压缩兜底；PDF >20MB 拒绝并提示 |
| iOS 存储驱逐风险 | 安装为 PWA + `navigator.storage.persist()`；云端永远有主副本，本地丢失可全量重拉 |
| GST 手改后再改金额 | 重算并提示"GST 已重置为自动值" |

## 10. 测试策略

- **Vitest 单元**：GST 计算（3/23 取整边界）、outbox 合并逻辑（含墓碑、SHA 冲突重试）、CSV 生成（转义、金额格式）、月度分桶
- **Playwright E2E**（MSW mock GitHub API）：录入→列表→搜索→编辑→导出全链路；离线录入→恢复网络→同步成功
- **CI（GitHub Actions）**：`tsc --noEmit` + ESLint + Prettier check + Vitest + Playwright，main 分支绿了才部署

## 11. 部署

- `ReceiptHub` 仓库 push main → Actions：build（`base: '/ReceiptHub/'`）→ 测试 → 部署 GitHub Pages
- PWA manifest + iOS meta（图标、启动屏、`apple-mobile-web-app-capable`），Safari 分享菜单"添加到主屏幕"安装
- 公开仓库 Actions 分钟数免费不限量

## 12. 实施阶段划分

1. **Phase 1（本设计范围）**：脚手架 + 数据层 + 四屏 UI + 同步 + 搜索 + 导出 + PWA + CI/CD 部署
2. **Phase 2**：Claude API 拍照自动提取五字段（浏览器直连，key 存 localStorage）
3. **Phase 3 候选**：GST 周期报表、原件打包下载、Xero 导入格式
