/**
 * 各goのセキュリティ問題を収集 → DB保存
 *
 * - npm audit: 脆弱性のある依存関係を検出
 * - ソースコードスキャン: ハードコード秘密、XSS、危険APIの使用など
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  REPO_TO_SLUG,
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createReviewPR,
  cleanup,
} from "../../lib/github/git-operations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GO_REPOS: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
  designsystem: "go-design-system",
  metago: "meta-go",
};

interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  cve?: string;
}

// ────────────────────────────────────────────────
// npm audit
// ────────────────────────────────────────────────

async function runNpmAudit(repoDir: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    execSync("npm ci --prefer-offline", {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 300_000,
    });
  } catch {
    try {
      execSync("npm install --legacy-peer-deps", {
        cwd: repoDir,
        stdio: "pipe",
        timeout: 300_000,
      });
    } catch {}
  }

  let auditRaw = "{}";
  try {
    execSync("npm audit --json", { cwd: repoDir, stdio: "pipe" });
  } catch (e: any) {
    auditRaw = e.stdout?.toString() ?? "{}";
  }

  try {
    const audit = JSON.parse(auditRaw);
    const vulns: Record<string, any> = audit.vulnerabilities ?? {};

    for (const [pkgName, vuln] of Object.entries(vulns)) {
      const v = vuln as any;
      if (!v.isDirect && v.severity === "low") continue; // indirect low は除外

      const severity = (
        ["critical", "high", "medium", "low"].includes(v.severity)
          ? v.severity
          : "low"
      ) as SecurityFinding["severity"];

      const via = Array.isArray(v.via) ? v.via : [];
      const cveList = via
        .filter((x: any) => typeof x === "object" && x.cve)
        .map((x: any) => x.cve)
        .flat()
        .join(", ");

      findings.push({
        severity,
        title: `脆弱性: ${pkgName} (${v.severity})`,
        description: `${pkgName} に脆弱性があります。影響範囲: ${v.range ?? "不明"}。${v.fixAvailable ? "修正バージョンあり。" : "現時点で修正なし。"}`,
        cve: cveList || undefined,
      });
    }
    console.log(`  npm audit: ${findings.length} vulnerabilities found`);
  } catch (e) {
    console.warn("  npm audit parse failed:", e);
  }

  return findings;
}

// ────────────────────────────────────────────────
// ソースコードの静的パターンスキャン
// ────────────────────────────────────────────────

interface ScanPattern {
  pattern: RegExp;
  severity: SecurityFinding["severity"];
  title: string;
  description: string;
}

const SCAN_PATTERNS: ScanPattern[] = [
  {
    pattern: /dangerouslySetInnerHTML/g,
    severity: "high",
    title: "XSS: dangerouslySetInnerHTML 使用",
    description:
      "dangerouslySetInnerHTML はXSS攻撃の主要な入口です。ユーザー入力をサニタイズせずに渡している場合、深刻なセキュリティリスクになります。",
  },
  {
    pattern: /eval\s*\(/g,
    severity: "critical",
    title: "コードインジェクション: eval() 使用",
    description:
      "eval()は任意のJavaScriptを実行できるため、攻撃者にコード実行の機会を与えます。",
  },
  {
    pattern:
      /(?:password|secret|api_key|apikey|token)\s*=\s*['"][^'"]{8,}['"]/gi,
    severity: "critical",
    title: "機密情報ハードコード疑い",
    description:
      "ソースコードに機密情報がハードコードされている可能性があります。環境変数で管理してください。",
  },
  {
    pattern: /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]+\s*\|\|\s*['"]\w{8,}/g,
    severity: "high",
    title: "秘密鍵のデフォルト値",
    description:
      "環境変数のフォールバックとして機密情報の平文が指定されています。本番環境で予期しない値が使われるリスクがあります。",
  },
  {
    pattern: /console\.log\([^)]*(?:token|secret|password|key|auth)/gi,
    severity: "medium",
    title: "機密情報のログ出力",
    description:
      "機密情報をconsole.logで出力しているパターンがあります。ログファイルや開発者ツールに漏洩するリスクがあります。",
  },
  {
    pattern: /\.innerHTML\s*=/g,
    severity: "medium",
    title: "XSS: innerHTML への直接代入",
    description:
      "innerHTML への直接代入はXSSリスクがあります。textContentを使うか、DOMPurifyでサニタイズしてください。",
  },
  {
    pattern: /fetch\([^)]*\)\s*\.then\([^)]*\)\s*(?!\.catch)/g,
    severity: "low",
    title: "エラーハンドリング: fetch の .catch なし",
    description:
      "fetchのPromiseチェーンに.catchがありません。ネットワークエラーが未処理になります。",
  },
];

function scanSourceCode(repoDir: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const foundPatterns = new Set<string>();

  let files: string[] = [];
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*"`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }

  for (const file of files) {
    const filePath = path.join(repoDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    for (const sp of SCAN_PATTERNS) {
      sp.pattern.lastIndex = 0;
      if (sp.pattern.test(content) && !foundPatterns.has(sp.title)) {
        foundPatterns.add(sp.title);
        findings.push({
          severity: sp.severity,
          title: sp.title,
          description: `${sp.description} (検出ファイル: ${file})`,
        });
      }
    }
  }

  console.log(
    `  source scan: ${files.length} files, ${findings.length} patterns found`,
  );
  return findings;
}

// ────────────────────────────────────────────────
// スコア計算
// ────────────────────────────────────────────────

function calcScore(findings: SecurityFinding[]): number {
  const penalties = {
    critical: 25,
    high: 15,
    medium: 5,
    low: 2,
  };
  const total = findings.reduce(
    (sum, f) => sum + (penalties[f.severity] ?? 0),
    0,
  );
  return Math.max(0, 100 - total);
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────

// ────────────────────────────────────────────────
// Claude によるセキュリティ問題の自動修正
// ────────────────────────────────────────────────

async function fixSecurityIssues(
  repoDir: string,
  findings: SecurityFinding[],
  productName: string,
  anthropic: Anthropic,
): Promise<{ patchCount: number; summary: string }> {
  // 修正可能な問題のみ対象（critical/high）
  const fixable = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  if (fixable.length === 0) return { patchCount: 0, summary: "" };

  // ソースファイルを収集
  let files: string[] = [];
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" | head -25`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return { patchCount: 0, summary: "" };
  }

  const sections: string[] = [];
  let totalChars = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), "utf-8");
      if (totalChars + content.length > 50_000) break;
      sections.push(`=== ${f} ===\n${content}`);
      totalChars += content.length;
    } catch {}
  }
  if (sections.length === 0) return { patchCount: 0, summary: "" };

  const prompt = `You are a security engineer. The app "${productName}" has these security issues:
${fixable.map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join("\n")}

Fix these security issues in the source code:
- Remove dangerouslySetInnerHTML where safe, or add a comment explaining why it's safe
- Remove console.log statements that output sensitive data (tokens, passwords, keys)
- Replace innerHTML assignments with textContent where content is not HTML
- Do NOT change application logic or remove functionality
- Do NOT fix issues if you're uncertain — skip rather than break

Source files:
${sections.join("\n\n")}

Return JSON only:
{
  "patches": [
    { "file": "relative/path.tsx", "newContent": "complete fixed content" }
  ],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

Only include actually changed files. Return ONLY the JSON.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  🔧 セキュリティ修正中... (試行 ${attempt})`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const raw =
        message.content[0]?.type === "text" ? message.content[0].text : "";
      const cleaned = raw
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");

      const result = JSON.parse(jsonMatch[0]) as {
        patches: Array<{ file: string; newContent: string }>;
        summary: string;
      };

      let patchCount = 0;
      for (const patch of result.patches ?? []) {
        const fullPath = path.join(repoDir, patch.file);
        if (!fs.existsSync(fullPath)) continue;
        fs.writeFileSync(fullPath, patch.newContent, "utf-8");
        console.log(`  ✓ 修正: ${patch.file}`);
        patchCount++;
      }
      return { patchCount, summary: result.summary ?? "" };
    } catch (e: any) {
      if (e?.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 60_000 * attempt));
        continue;
      }
      console.warn("  セキュリティ修正失敗:", String(e).slice(0, 150));
      return { patchCount: 0, summary: "" };
    }
  }
  return { patchCount: 0, summary: "" };
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────

async function processRepo(product: any, repo: string) {
  console.log(`\n🔒 Security: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;

  try {
    repoDir = cloneRepo(repo);

    const [auditFindings, sourceFindings] = await Promise.all([
      runNpmAudit(repoDir),
      Promise.resolve(scanSourceCode(repoDir)),
    ]);

    const allFindings = [...auditFindings, ...sourceFindings];
    const score = calcScore(allFindings);

    // 既存レコードを削除してから新規挿入
    await supabase
      .schema("metago")
      .from("security_items")
      .delete()
      .eq("product_id", product.id);

    for (const f of allFindings.slice(0, 30)) {
      await supabase
        .schema("metago")
        .from("security_items")
        .insert({
          product_id: product.id,
          severity: f.severity,
          title: f.title.substring(0, 200),
          description: f.description.substring(0, 500),
          cve: f.cve ?? null,
          state: "new",
        });
    }

    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category: "security",
      score,
    });

    console.log(`  ✓ ${allFindings.length} findings, score: ${score}`);

    // critical/high 問題 → Claude が修正して L2 PR 作成
    const fixableFindings = allFindings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    );
    if (fixableFindings.length > 0) {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      const { patchCount, summary } = await fixSecurityIssues(
        repoDir,
        fixableFindings,
        product.display_name,
        anthropic,
      );

      if (patchCount > 0 && hasChanges(repoDir)) {
        const branch = `metago/security-${new Date().toISOString().slice(0, 10)}`;
        const pushed = createBranchAndCommit(
          repoDir,
          branch,
          `fix(security): セキュリティ問題の修正 [MetaGo L2]`,
        );
        if (pushed) {
          const pr = await createReviewPR(repo, {
            title: `🤖 [MetaGo L2] セキュリティ修正 — ${product.display_name}`,
            body: `MetaGo + Claude によるセキュリティ問題の修正提案です。

**検出された問題 (${fixableFindings.length}件)**
${fixableFindings.map((f) => `- [${f.severity}] ${f.title}`).join("\n")}

**変更内容**
${summary}

修正ファイル数: ${patchCount} 件

> ⚠️ L2: 動作確認後に承認してください。セキュリティ修正は機能に影響する可能性があります。`,
            head: branch,
            labels: ["metago-needs-review"],
          });
          await supabase
            .schema("metago")
            .from("approval_queue")
            .insert({
              product_id: product.id,
              title: `セキュリティ修正PR: ${product.display_name}`,
              description: fixableFindings
                .map((f) => `[${f.severity}] ${f.title}`)
                .join("\n"),
              category: "security",
              state: "pending",
              meta: { pr_url: pr.url, level: "L2", repo },
            });
          console.log(`  📋 L2 PR作成: ${pr.url}`);
        }
      }
    }
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "security",
        title: `セキュリティチェック失敗: ${repo}`,
        description: String(e),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 Starting security scan...");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  const targetRepo = process.env.TARGET_REPO;
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null;

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue;
    const repo = GO_REPOS[product.name];
    if (!repo) continue;
    await processRepo(product, repo);
  }

  console.log("\n✅ Security scan complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
