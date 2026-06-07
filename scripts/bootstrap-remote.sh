#!/usr/bin/env bash
# 一键创建远程仓库并部署。前置：gh auth login 已切到 WilsonZheng 个人账号。
set -euo pipefail

ACTIVE=$(gh api user --jq .login)
if [ "$ACTIVE" != "WilsonZheng" ]; then
  echo "❌ 当前 gh 账号是 $ACTIVE，不是 WilsonZheng。先运行: gh auth login / gh auth switch"
  exit 1
fi

echo "✅ 账号确认: $ACTIVE"

# 1. 私有数据仓库
cd "$(dirname "$0")/../../ReceiptHub-data"
git add -A && git commit -m "chore: seed config" --quiet || true
gh repo create WilsonZheng/ReceiptHub-data --private --source . --push
echo "✅ ReceiptHub-data (private) 已创建并推送"

# 2. 应用仓库（public，Pages 要求）
cd "$(dirname "$0")/.."
gh repo create WilsonZheng/ReceiptHub --public --source . --push
echo "✅ ReceiptHub (public) 已创建并推送"

# 3. 启用 Pages（Actions 构建模式）
gh api -X POST repos/WilsonZheng/ReceiptHub/pages -f build_type=workflow 2>/dev/null ||
  echo "ℹ️  Pages 可能已启用，跳过"

echo ""
echo "🚀 部署中… 查看进度: gh run watch"
echo "完成后访问: https://wilsonzheng.github.io/ReceiptHub/"
echo ""
echo "下一步: 创建 fine-grained PAT (Settings → Developer settings → Fine-grained tokens)"
echo "  - Repository access: 只选 ReceiptHub-data"
echo "  - Permissions: Contents → Read and write"
echo "  - 粘贴进应用锁屏即可使用"
