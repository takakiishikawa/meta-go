/**
 * Claude を使ってコード修正を行うユーティリティ
 *
 * GitHub Actions 上では Claude Code Max プランの CLI 経由で呼び出す
 * (Anthropic API 課金なし)。詳細は lib/metago/claude-cli.ts 参照。
 */

import { runClaudeForText } from "../metago/claude-cli";

export interface FilePatch {
  filePath: string;
  newContent: string;
}

/**
 * 違反箇所のある単一ファイルを Claude に修正させる
 * 返り値: 修正後のファイル内容（失敗時は null）
 */
export async function fixFileWithClaude(params: {
  fileName: string;
  fileContent: string;
  violations: string[];
  rule: string;
}): Promise<string | null> {
  const { fileName, fileContent, violations, rule } = params;

  if (fileContent.length > 80_000) {
    console.warn(
      `${fileName} is too large for Claude fix (${fileContent.length} chars), skipping`,
    );
    return null;
  }

  try {
    return await runClaudeForText(
      `You are fixing code violations in a TypeScript/React file.

File: ${fileName}

Rule: ${rule}

Violations found:
${violations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

Current file content:
\`\`\`tsx
${fileContent}
\`\`\`

Fix all listed violations. Return ONLY the complete fixed file content with no explanation, no markdown code fences, no prefix text.`,
    );
  } catch (e) {
    console.warn(`Claude fix failed for ${fileName}:`, String(e).slice(0, 200));
    return null;
  }
}

/**
 * 複数ファイルの違反を Claude に一括修正させる
 */
export async function fixViolationsWithClaude(
  violations: Array<{ file: string; content: string; issues: string[] }>,
  rule: string,
): Promise<FilePatch[]> {
  const patches: FilePatch[] = [];

  for (const v of violations) {
    const fixed = await fixFileWithClaude({
      fileName: v.file,
      fileContent: v.content,
      violations: v.issues,
      rule,
    });
    if (fixed) {
      patches.push({ filePath: v.file, newContent: fixed });
    }
    // 並列実行 + CLI 呼び出し間隔調整
    await new Promise((r) => setTimeout(r, 1000));
  }

  return patches;
}
