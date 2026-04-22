#!/bin/bash
# 他のgoリポジトリに Claude Code Action を展開するスクリプト
# 実行前に GITHUB_TOKEN 環境変数を設定してください

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

CLAUDE_YML_CONTENT='name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == '\''issue_comment'\'' && contains(github.event.comment.body, '\''@claude'\'')) ||
      (github.event_name == '\''pull_request_review_comment'\'' && contains(github.event.comment.body, '\''@claude'\'')) ||
      (github.event_name == '\''issues'\'' && contains(github.event.issue.body, '\''@claude'\'')) ||
      (github.event_name == '\''pull_request_review'\'' && contains(github.event.review.body, '\''@claude'\''))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Run Claude Code
        uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
'

TMPDIR_BASE=$(mktemp -d)

for REPO in "${REPOS[@]}"; do
  echo "📦 Processing $REPO..."

  REPO_DIR="$TMPDIR_BASE/$REPO"
  git clone "https://${GITHUB_TOKEN}@github.com/$GITHUB_OWNER/$REPO.git" "$REPO_DIR" --depth 1

  mkdir -p "$REPO_DIR/.github/workflows"
  echo "$CLAUDE_YML_CONTENT" > "$REPO_DIR/.github/workflows/claude.yml"

  cd "$REPO_DIR"
  git config user.email "metago@github-actions"
  git config user.name "MetaGo"

  if git diff --quiet; then
    echo "  No changes needed for $REPO"
  else
    git add .github/workflows/claude.yml
    git commit -m "ci: Claude Code Actionを追加"
    git push origin HEAD
    echo "  ✓ Deployed to $REPO"
  fi

  cd -
done

rm -rf "$TMPDIR_BASE"
echo "✅ Claude Code Action deployed to all go repositories"
