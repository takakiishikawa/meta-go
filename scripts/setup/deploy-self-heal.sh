#!/bin/bash
# 各goリポジトリに self-heal.yml ワークフローを配布する
# 実行前に GITHUB_TOKEN 環境変数を設定してください
#
# 使い方:
#   export GITHUB_TOKEN="ghp_xxxx"
#   bash scripts/setup/deploy-self-heal.sh

set -e

GITHUB_OWNER="takakiishikawa"
REPOS=(
  "native-go"
  "care-go"
  "kenyaku-go"
  "cook-go"
  "physical-go"
  "task-go"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../../templates/self-heal.yml"

if [ ! -f "$TEMPLATE" ]; then
  echo "❌ templates/self-heal.yml が見つかりません"
  exit 1
fi

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN が設定されていません"
  exit 1
fi

TMPDIR_BASE=$(mktemp -d)
trap "rm -rf $TMPDIR_BASE" EXIT

for REPO in "${REPOS[@]}"; do
  echo "📦 Processing $REPO..."

  REPO_DIR="$TMPDIR_BASE/$REPO"
  git clone "https://${GITHUB_TOKEN}@github.com/$GITHUB_OWNER/$REPO.git" "$REPO_DIR" --depth 1 -q

  mkdir -p "$REPO_DIR/.github/workflows"
  cp "$TEMPLATE" "$REPO_DIR/.github/workflows/self-heal.yml"

  cd "$REPO_DIR"
  git config user.email "metago@github-actions"
  git config user.name "MetaGo"

  if git diff --quiet HEAD -- .github/workflows/self-heal.yml 2>/dev/null && \
     git ls-files --error-unmatch .github/workflows/self-heal.yml 2>/dev/null; then
    echo "  No changes needed for $REPO"
  else
    git add .github/workflows/self-heal.yml
    git commit -m "ci: MetaGo self-heal ワークフローを追加"
    git push origin HEAD -q
    echo "  ✓ Deployed to $REPO"
  fi

  cd - > /dev/null
done

echo ""
echo "✅ self-heal.yml deployed to all go repositories"
echo ""
echo "⚠️  各リポジトリで以下のシークレットを設定してください:"
echo "   METAGO_URL        — MetaGoのVercel URL (例: https://metago.vercel.app)"
echo "   METAGO_SERVICE_KEY — SupabaseのSERVICE_ROLE_KEY"
