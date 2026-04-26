/**
 * Claude CLI 呼び出しユーティリティ
 *
 * GitHub Actions 上の MetaGo スクリプト群は Claude Code Max プランの
 * `claude` CLI 経由で Claude を呼ぶ。Anthropic API への直接課金は行わない。
 *
 * 認証: `CLAUDE_CODE_OAUTH_TOKEN` 環境変数 (CLI が自動で参照)
 * 前提: ワークフロー側で `npm install -g @anthropic-ai/claude-code` 済み
 */

import { spawnSync } from "child_process";

export interface ClaudeCliOptions {
  cwd?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

// 70KB ソースの 7軸評価で 3 分超えるケースがあったため 10 分に設定。
// CLI 側の応答が止まれば early-exit するので、上限を上げてもコスト悪化はしない。
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_RETRIES = 3;
const STDOUT_MAX_BUFFER = 10 * 1024 * 1024;

function stripFences(text: string): string {
  return text
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/**
 * 文字列が「コードの先頭らしくない」場合 true。
 * Claude が patches[].newContent に narration や markdown fence を混入させる
 * 事故 (2026-04-26 大規模デプロイ失敗) を二度と起こさないためのガード。
 */
function looksLikeNarration(content: string): boolean {
  const first = (
    content.split("\n").find((l) => l.trim().length > 0) ?? ""
  ).trim();
  if (!first) return false;
  // markdown fence
  if (/^```/.test(first)) return true;
  // 典型的な英文ナレーション開始語
  if (
    /^(The|I'|I will\b|Here\b|Here's|Let me\b|Looking\b|Now I\b|Sure\b|First,|This is\b|Based on\b|To fix\b|This file\b|No\b|There\b|It looks\b|Since\b|Given\b)/.test(
      first,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Claude が返した JSON のうち、patches 配列があればその newContent を検査し、
 * narration / markdown fence で始まるものを除外する。
 */
function sanitizePatches<T>(parsed: T): T {
  const obj = parsed as any;
  if (!obj || !Array.isArray(obj.patches)) return parsed;
  const before = obj.patches.length;
  obj.patches = obj.patches.filter((p: any) => {
    if (typeof p?.newContent !== "string") return false;
    if (looksLikeNarration(p.newContent)) {
      console.warn(
        `  ⚠️  reject patch for ${p?.file ?? "<unknown>"}: looks like narration / fence`,
      );
      return false;
    }
    return true;
  });
  if (obj.patches.length < before) {
    console.warn(
      `  Filtered ${before - obj.patches.length} narration-injected patch(es)`,
    );
  }
  return parsed;
}

function isRateLimitMessage(s: string): boolean {
  return /rate.?limit|429|too many requests/i.test(s);
}

/**
 * `claude -p <prompt>` を実行し、stdout (assistant の最終応答) を文字列で返す。
 * Rate limit 検知時は最大 maxRetries 回まで指数バックオフで再試行する。
 */
export async function runClaudeCLI(
  prompt: string,
  options: ClaudeCliOptions = {},
): Promise<string> {
  const {
    cwd,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = spawnSync(
      "claude",
      ["--dangerously-skip-permissions", "-p", prompt],
      {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
        maxBuffer: STDOUT_MAX_BUFFER,
      },
    );

    const stdout = (result.stdout ?? Buffer.alloc(0)).toString();
    const stderr = (result.stderr ?? Buffer.alloc(0)).toString();

    if (result.status === 0) return stdout;

    const combined = `${stderr}\n${stdout}`;
    if (isRateLimitMessage(combined) && attempt < maxRetries) {
      const wait = 60_000 * attempt;
      console.warn(
        `  Claude CLI rate limit (${attempt}/${maxRetries}), ${wait / 1000}s 待機...`,
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    lastErr = new Error(
      `Claude CLI exited with code ${result.status}: ${(stderr || stdout).slice(0, 500)}`,
    );
    break;
  }
  throw lastErr ?? new Error("Claude CLI failed");
}

/**
 * Claude CLI を JSON 応答前提で呼び出し、パース済み値を返す。
 * Markdown フェンスや前後の余分なテキストを許容する。
 */
export async function runClaudeForJSON<T = unknown>(
  prompt: string,
  options: ClaudeCliOptions = {},
): Promise<T> {
  const raw = await runClaudeCLI(prompt, options);
  const cleaned = stripFences(raw);
  let parsed: T;
  try {
    parsed = JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) {
      throw new Error(
        `Claude response was not valid JSON: ${raw.slice(0, 500)}`,
      );
    }
    parsed = JSON.parse(m[0]) as T;
  }
  return sanitizePatches(parsed);
}

/**
 * Claude CLI をテキスト応答前提で呼び出し、フェンスを剥がした文字列を返す。
 * (例: ファイル全体の修正内容を直接受け取りたい場合)
 */
export async function runClaudeForText(
  prompt: string,
  options: ClaudeCliOptions = {},
): Promise<string> {
  const raw = await runClaudeCLI(prompt, options);
  return stripFences(raw);
}
