/**
 * Claude API を使ってコード修正を行うユーティリティ
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `You are fixing code violations in a TypeScript/React file.

File: ${fileName}

Rule: ${rule}

Violations found:
${violations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

Current file content:
\`\`\`tsx
${fileContent}
\`\`\`

Fix all listed violations. Return ONLY the complete fixed file content with no explanation, no markdown code fences, no prefix text.`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== "text") return null;

      return content.text
        .replace(/^```[^\n]*\n/, "")
        .replace(/\n```$/, "")
        .trim();
    } catch (e: any) {
      const isRateLimit =
        e?.status === 429 || e?.error?.error?.type === "rate_limit_error";
      if (isRateLimit && attempt < MAX_RETRIES) {
        const wait = 60_000 * attempt;
        console.warn(
          `  Rate limit hit for ${fileName} (attempt ${attempt}/${MAX_RETRIES}), waiting ${wait / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.warn(`Claude API error for ${fileName}:`, e);
      return null;
    }
  }
  return null;
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
    // Rate limit pause: 6リポ並列実行を考慮して長めに待つ
    await new Promise((r) => setTimeout(r, 3000));
  }

  return patches;
}
