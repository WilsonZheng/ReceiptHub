# AGENTS.md — ReceiptHub

> 跨工具 AI 协作入口（Claude Code / Codex / Cursor / Copilot…）。
> **完整知识库在 [CLAUDE.md](CLAUDE.md)**——架构、同步协议、五轮 iOS 踩坑实录都在那里，开工前必读。
> 本文件是可操作摘要 + 硬规则清单。

## 项目一览

自用 invoice/receipt 管理 PWA。React 19 + TS strict + Tailwind v4 + Dexie（本地优先），
数据同步到私有 GitHub 仓库（Contents API + PAT），AI 提取走 Gemini 2.5 Flash 免费层。
线上：https://wilsonzheng.github.io/ReceiptHub/ · **零后端，$0/月。**

## 命令

```bash
npm install
npm run dev                # 本地开发
./scripts/verify.sh        # ★ 一键验证门（与 CI 完全一致）：prettier → tsc → vitest → build → playwright
```

**提交纪律：`./scripts/verify.sh` 末行打出 `ALL GREEN` 才允许 commit/push。**
判断任何命令成败只看退出码，永远不要从管道输出尾行猜测（有真实翻车案例）。

## 硬规则（违反即 bug 或破坏既定决策）

1. **日期**：取"今天"只用 `lib/dates.ts` 的 `localToday()`。`toISOString().slice(0,10)` 是 UTC，NZ 用户每天上午会差一天。
2. **GST**：含税价反推 = `total × 3/23`（不是 ×0.15），四舍五入到分；金额一律整数分（`totalCents`）。
3. **软删除**：删除=墓碑（`deleted: true`）。一切计数/统计/搜索/导出必须过滤 `!r.deleted`。
4. **分类**：存储恒为英文规范名，中文只在显示层（`lib/categories.ts`）。新增分类一律走 `addCategoryToConfig`（大小写去重）。
5. **认证是既定决策，禁止"修复"**：PAT 即密码、明文 localStorage，用户两次否决了更复杂方案。锁屏 UI 不得出现 GitHub/PAT/token/仓库名字样（e2e 有断言）。安全扫描对此报警 = 已知已接受。
6. **iOS PWA**：关键 UI 永不锚定底部（5 轮 debug 的结论）；输入字号 ≥16px；`backdrop-filter` 只放视觉壳，弹层/遮罩挂无滤镜外层。
7. **颜色/字体只用 `theme/tokens.css` 的 CSS 变量**，组件禁止硬编码。收入 `+` 绿（accent）、支出 `-` 红（danger）。
8. **i18n**：所有用户可见文案进 `lib/i18n.ts` 双字典（`Record<MsgKey,string>` 编译期强制中英对齐，漏译= tsc 报错）。
9. **e2e**：`getByRole` name 默认子串+大小写不敏感，`exact:true` 则大小写敏感；按钮可访问名可能带 emoji 前缀；GitHub/Gemini 一律 `page.route` mock。
10. **AI 提取输出零信任**：日期正则、金额限幅、分类归并/限长，见 `lib/extract.ts` 的校验段。

## 部署与上线确认

push `main` → Actions → Pages。**确认新版上线看首页 `index-*.js` 资源指纹变化**，不要只看 Actions 状态。
本机 gh CLI 是公司账号——**不能**对 WilsonZheng 名下仓库做 API 写操作；git push 走 `git@github.com-personal:` SSH 别名。

## 学到新坑怎么办

写进 `CLAUDE.md` 对应章节（这是本仓库的活文档），让下一个会话不再踩。
