#!/usr/bin/env bash
# 推送两个仓库并触发 Pages 部署。
# 前置：github.com/new 上已创建空仓库 ReceiptHub (public) 和 ReceiptHub-data (private)，
#       不要勾选 README/license（必须是空仓库）。
# 认证：走 ~/.ssh/config 的 github.com-personal 别名（WilsonZheng 个人身份）。
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$APP_DIR/../ReceiptHub-data"

echo "→ 验证个人 SSH 身份…"
ssh -T git@github.com-personal 2>&1 | grep -q 'Hi WilsonZheng' || {
  echo "❌ SSH 别名 github.com-personal 未认证为 WilsonZheng"
  exit 1
}

echo "→ 推送 ReceiptHub-data (private)…"
git -C "$DATA_DIR" push -u origin main

echo "→ 推送 ReceiptHub (public)…"
git -C "$APP_DIR" push -u origin main

echo ""
echo "🚀 已推送。deploy workflow 会自动启用并部署 Pages（首次约 2 分钟）。"
echo "   进度: https://github.com/WilsonZheng/ReceiptHub/actions"
echo "   完成后访问: https://wilsonzheng.github.io/ReceiptHub/"
echo ""
echo "最后一步: 创建 fine-grained PAT (Settings → Developer settings → Fine-grained tokens)"
echo "  - Repository access: 只选 ReceiptHub-data"
echo "  - Permissions: Contents → Read and write"
echo "  - 粘贴进应用锁屏即可使用"
