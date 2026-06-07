#!/usr/bin/env bash
# ★ 一键验证门：与 CI 完全一致。AI/人类提交前必须看到 ALL GREEN。
# 失败即非零退出——判断成败只看退出码。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ prettier --check"
npx prettier --check src e2e scripts

echo "→ tsc --noEmit"
npx tsc --noEmit

echo "→ vitest"
npx vitest run

echo "→ vite build（playwright 的 preview 依赖 dist/，必须先于 e2e）"
npx vite build

echo "→ playwright e2e"
npx playwright test

echo "✅ ALL GREEN"
