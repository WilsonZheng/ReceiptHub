# Copilot Instructions — ReceiptHub

1. 开工前先读 [`AGENTS.md`](../AGENTS.md)（硬规则清单）和 [`CLAUDE.md`](../CLAUDE.md)（完整知识库与踩坑实录）。
2. 任何提交前运行 `./scripts/verify.sh`，必须以 `ALL GREEN` 结束。
3. 用户可见文案必须进 `src/lib/i18n.ts` 双语字典；颜色/字体只用 `src/theme/tokens.css` 变量。
4. 认证方案（PAT 即密码、明文 localStorage）是用户拍板的既定决策，不要"修复"。
5. 学到新坑写入 `CLAUDE.md`。
6. AI 默认 Mistral 视觉模型 `ministral-14b-2512`、Gemini 可切换；输出零信任，429/瞬时故障要重试，2xx 空响应要明确报错。修改规则时同步 `AGENTS.md` 与 `CLAUDE.md`。
