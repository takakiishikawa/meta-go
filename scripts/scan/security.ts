/**
 * security SCAN
 *
 * npm audit + ソースコード静的パターンスキャン → 違反item UPSERT + score保存
 * 修正PRは fix-cron に委譲
 *
 * 環境変数:
 *   TARGET_REPO  — 対象リポジトリ名
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { cloneRepo, cleanup } from "../../lib/github/git-operations";
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  saveScore,
  reviveResolvedItems,
  upsertItem,
  markStaleItemsResolved,
} from "../../lib/metago/items";

const supabase = getSupabase();

interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  cve?: string;
}

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
      if (!v.isDirect && v.severity === "low") continue;

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
    console.log(`  npm audit: ${findings.length} vulnerabilities`);
  } catch (e) {
    console.warn("  npm audit parse failed");
  }

  return findings;
}

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
      "環境変数のフォールバックとして機密情報の平文が指定されています。",
  },
  {
    pattern: /console\.log\([^)]*(?:token|secret|password|key|auth)/gi,
    severity: "medium",
    title: "機密情報のログ出力",
    description: "機密情報をconsole.logで出力しているパターンがあります。",
  },
  {
    pattern: /\.innerHTML\s*=/g,
    severity: "medium",
    title: "XSS: innerHTML への直接代入",
    description:
      "innerHTML への直接代入はXSSリスクがあります。textContentを使うか、DOMPurifyでサニタイズしてください。",
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
    `  source scan: ${files.length} files, ${findings.length} patterns`,
  );
  return findings;
}

function calcScore(findings: SecurityFinding[]): number {
  const penalties = { critical: 25, high: 15, medium: 5, low: 2 };
  const total = findings.reduce(
    (sum, f) => sum + (penalties[f.severity] ?? 0),
    0,
  );
  return Math.max(0, 100 - total);
}

async function scanRepo(product: any, repo: string) {
  console.log(`\n🔒 [SCAN] security: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;
  const scanStartedAt = new Date();

  try {
    repoDir = cloneRepo(repo);

    const [auditFindings, sourceFindings] = await Promise.all([
      runNpmAudit(repoDir),
      Promise.resolve(scanSourceCode(repoDir)),
    ]);

    const allFindings = [...auditFindings, ...sourceFindings];
    const score = calcScore(allFindings);

    for (const f of allFindings.slice(0, 30)) {
      await upsertItem(supabase, "security_items", {
        product_id: product.id,
        category: "security",
        title: f.title,
        description: f.description,
        severity: f.severity,
        cve: f.cve ?? null,
        level: f.severity === "critical" || f.severity === "high" ? "L2" : "L1",
      });
    }

    await saveScore(supabase, product.id, "security", score);

    const revived = await reviveResolvedItems(
      supabase,
      "security_items",
      product.id,
      scanStartedAt,
    );

    const resolved = await markStaleItemsResolved(
      supabase,
      "security_items",
      product.id,
      scanStartedAt,
    );

    console.log(
      `  ✓ ${allFindings.length} findings, score: ${score}${resolved > 0 ? `, ${resolved} resolved` : ""}${revived > 0 ? `, ${revived} revived` : ""}`,
    );
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "security-scan",
        title: `security scan失敗: ${repo}`,
        description: String(e).slice(0, 500),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [SCAN] security");

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
    await scanRepo(product, repo);
  }

  console.log("\n✅ [SCAN] security complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
