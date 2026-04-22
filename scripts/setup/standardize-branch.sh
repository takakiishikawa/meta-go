#!/bin/bash
# 他のgoリポジトリのデフォルトブランチを main に統一する

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

for REPO in "${REPOS[@]}"; do
  echo "🔀 Processing $REPO..."

  CURRENT=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$GITHUB_OWNER/$REPO" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['default_branch'])")

  if [ "$CURRENT" = "main" ]; then
    echo "  Already using main branch"
    continue
  fi

  echo "  Current default branch: $CURRENT → changing to main"

  # mainブランチが存在するか確認
  BRANCHES=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$GITHUB_OWNER/$REPO/branches" | \
    python3 -c "import sys,json; print([b['name'] for b in json.load(sys.stdin)])")

  if [[ "$BRANCHES" != *"main"* ]]; then
    echo "  main branch does not exist, creating from $CURRENT..."
    # リポジトリをクローンして main ブランチを作成
    TMPDIR=$(mktemp -d)
    git clone "https://${GITHUB_TOKEN}@github.com/$GITHUB_OWNER/$REPO.git" "$TMPDIR/$REPO" --depth 1
    cd "$TMPDIR/$REPO"
    git checkout -b main
    git push origin main
    cd -
    rm -rf "$TMPDIR"
  fi

  # デフォルトブランチを main に変更
  curl -s -X PATCH \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"default_branch":"main"}' \
    "https://api.github.com/repos/$GITHUB_OWNER/$REPO"

  echo "  ✓ Default branch changed to main"
done

echo "✅ Branch standardization complete"
