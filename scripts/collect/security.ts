/**
 * 各goのセキュリティ問題を収集 → DB保存
 *
 * - npm audit: 脆弱性のある依存関係を検出
 * - ソースコードスキャン: ハードコード秘密、XSS、危険APIの使用など
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import {
  REPO_TO_SLUG,
  cloneRepo,
  cleanup,
} from "../../lib/github/git-operations"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GO_REPOS: Record<string, string> = {
  nativego:   "native-go",
  carego:     "care-go",
  kenyakugo:  "kenyaku-go",
  cookgo:     "cook-go",
  physicalgo: "physical-go",
  taskgo:     "task-go",
}

interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low"
  title: string
  description: string
  cve?: string
}

// ────────────────────────────────────────────────
// npm audit
// ────────────────────────────────────────────────

async function runNpmAudit(repoDir: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []

  try {
    execSync("npm ci --prefer-offline", { cwd: repoDir, stdio: "pipe", timeout: 300_000 })
  } catch {
    try {
      execSync("npm install --legacy-peer-deps", { cwd: repoDir, stdio: "pipe", timeout: 300_000 })
    } catch {}
  }

  let auditRaw = "{}"
  try {
    execSync("npm audit --json", { cwd: repoDir, stdio: "pipe" })
  } catch (e: any) {
    auditRaw = e.stdout?.toString() ?? "{}"
  }

  try {
    const audit = JSON.parse(auditRaw)
    const vulns: Record<string, any> = audit.vulnerabilities ?? {}

    for (const [pkgName, vuln] of Object.entries(vulns)) {
      const v = vuln as any
      if (!v.isDirect && v.severity === "low") continue // indirect low は除外

      const severity = (["critical","high","medium","low"].includes(v.severity)
        ? v.severity : "low") as SecurityFinding["severity"]

      const via = Array.isArray(v.via) ? v.via : []
      const cveList = via
        .filter((x: any) => typeof x === "object" && x.cve)
        .map((x: any) => x.cve)
        .flat()
        .join(", ")

      findings.push({
        severity,
        title: `脆弱性: ${pkgName} (${v.severity})`,
        description: `${pkgName} に脆弱性があります。影響範囲: ${v.range ?? "不明"}。${v.fixAvailable ? "修正バージョンあり。" : "現時点で修正なし。"}`,
        cve: cveList || undefined,
      })
    }
    console.log(`  npm audit: ${findings.length} vulnerabilities found`)
  } catch (e) {
    console.warn("  npm audit parse failed:", e)
  }

  return findings
}

// ────────────────────────────────────────────────
// ソースコードの静的パターンスキャン
// ────────────────────────────────────────────────

interface ScanPattern {
  pattern: RegExp
  severity: SecurityFinding["severity"]
  title: string
  description: string
}

const SCAN_PATTERNS: ScanPattern[] = [
  {
    pattern: /dangerouslySetInnerHTML/g,
    severity: "high",
    title: "XSS: dangerouslySetInnerHTML 使用",
    description: "dangerouslySetInnerHTML はXSS攻撃の主要な入口です。ユーザー入力をサニタイズせずに渡している場合、深刻なセキュリティリスクになります。",
  },
  {
    pattern: /eval\s*\(/g,
    severity: "critical",
    title: "コードインジェクション: eval() 使用",
    description: "eval()は任意のJavaScriptを実行できるため、攻撃者にコード実行の機会を与えます。",
  },
  {
    pattern: /(?:password|secret|api_key|apikey|token)\s*=\s*['"][^'"]{8,}['"]/gi,
    severity: "critical",
    title: "機密情報ハードコード疑い",
    description: "ソースコードに機密情報がハードコードされている可能性があります。環境変数で管理してください。",
  },
  {
    pattern: /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]+\s*\|\|\s*['"]\w{8,}/g,
    severity: "high",
    title: "秘密鍵のデフォルト値",
    description: "環境変数のフォールバックとして機密情報の平文が指定されています。本番環境で予期しない値が使われるリスクがあります。",
  },
  {
    pattern: /console\.log\([^)]*(?:token|secret|password|key|auth)/gi,
    severity: "medium",
    title: "機密情報のログ出力",
    description: "機密情報をconsole.logで出力しているパターンがあります。ログファイルや開発者ツールに漏洩するリスクがあります。",
  },
  {
    pattern: /\.innerHTML\s*=/g,
    severity: "medium",
    title: "XSS: innerHTML への直接代入",
    description: "innerHTML への直接代入はXSSリスクがあります。textContentを使うか、DOMPurifyでサニタイズしてください。",
  },
  {
    pattern: /fetch\([^)]*\)\s*\.then\([^)]*\)\s*(?!\.catch)/g,
    severity: "low",
    title: "エラーハンドリング: fetch の .catch なし",
    description: "fetchのPromiseチェーンに.catchがありません。ネットワークエラーが未処理になります。",
  },
]

function scanSourceCode(repoDir: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const foundPatterns = new Set<string>()

  let files: string[] = []
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \\) ` +
      `-not -path "./node_modules/*" -not -path "./.next/*"`,
      { cwd: repoDir, stdio: "pipe" }
    ).toString().trim().split("\n").filter(Boolean)
  } catch {
    return []
  }

  for (const file of files) {
    const filePath = path.join(repoDir, file)
    let content: string
    try {
      content = fs.readFileSync(filePath, "utf-8")
    } catch {
      continue
    }

    for (const sp of SCAN_PATTERNS) {
      sp.pattern.lastIndex = 0
      if (sp.pattern.test(content) && !foundPatterns.has(sp.title)) {
        foundPatterns.add(sp.title)
        findings.push({
          severity: sp.severity,
          title: sp.title,
          description: `${sp.description} (検出ファイル: ${file})`,
        })
      }
    }
  }

  console.log(`  source scan: ${files.length} files, ${findings.length} patterns found`)
  return findings
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
  }
  const total = findings.reduce((sum, f) => sum + (penalties[f.severity] ?? 0), 0)
  return Math.max(0, 100 - total)
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────

async function processRepo(product: any, repo: string) {
  console.log(`\n🔒 Security: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    const [auditFindings, sourceFindings] = await Promise.all([
      runNpmAudit(repoDir),
      Promise.resolve(scanSourceCode(repoDir)),
    ])

    const allFindings = [...auditFindings, ...sourceFindings]
    const score = calcScore(allFindings)

    // 既存レコードを削除してから新規挿入
    await supabase.schema("metago").from("security_items").delete().eq("product_id", product.id)

    for (const f of allFindings.slice(0, 30)) {
      await supabase.schema("metago").from("security_items").insert({
        product_id: product.id,
        severity:   f.severity,
        title:      f.title.substring(0, 200),
        description: f.description.substring(0, 500),
        cve:        f.cve ?? null,
        state:      "new",
      })
    }

    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category:   "security",
      score,
    })

    console.log(`  ✓ ${allFindings.length} findings, score: ${score}`)
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e)
    await supabase.schema("metago").from("execution_logs").insert({
      product_id: product.id,
      category:   "security",
      title:      `セキュリティチェック失敗: ${repo}`,
      description: String(e),
      state:      "failed",
    })
  } finally {
    if (repoDir) cleanup(repoDir)
  }
}

async function main() {
  console.log("🚀 Starting security scan...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue
    const repo = GO_REPOS[product.name]
    if (!repo) continue
    await processRepo(product, repo)
  }

  console.log("\n✅ Security scan complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
