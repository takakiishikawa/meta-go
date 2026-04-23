#!/bin/bash
# 各goリポジトリから self-heal.yml を削除するスクリプト
# 実行前に GITHUB_TOKEN 環境変数を設定してください
#
# 使い方:
#   export GITHUB_TOKEN="ghp_xxxx"
#   bash scripts/setup/remove-self-heal.sh

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

  WORKFLOW_FILE="$REPO_DIR/.github/workflows/self-heal.yml"

  if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "  self-heal.yml not found, skipping $REPO"
    continue
  fi

  cd "$REPO_DIR"
  git config user.email "metago@github-actions"
  git config user.name "MetaGo"
  git rm .github/workflows/self-heal.yml
  git commit -m "ci: MetaGo中央集権型に移行のためself-heal.ymlを削除"
  git push origin HEAD -q
  echo "  ✓ Removed self-heal.yml from $REPO"

  cd - > /dev/null
done

echo ""
echo "✅ self-heal.yml removed from all go repositories"
echo "   ℹ️  今後の自動修正はMeta-GoのCollect Dailyワークフローが中央で担います"
