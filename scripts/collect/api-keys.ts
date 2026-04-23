/**
 * 各goリポジトリをcloneしてソースコードから環境変数名を収集する
 *
 * GitHub Code Search APIの代わりにローカルclone + grep で確実に検出する。
 * 結果を metago.api_keys テーブルに upsert する（env_var_name が一意キー）
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { cloneRepo, cleanup } from "../../lib/github/git-operations"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GO_REPOS: Record<string, string> = {
  nativego:   "native-go",
  carego:     "care-go",
  kenyakugo:  "kenyaku-go",
  cookgo:     "cook-go",
  physicalgo: "physical-go",
  taskgo:       "task-go",
  designsystem: "go-design-system",
  metago:       "meta-go",
}

const SKIP_VARS = new Set([
  "NODE_ENV", "PORT", "HOST", "CI", "TZ", "PATH",
  "NEXT_RUNTIME", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_PROVIDER", "VERCEL_GIT_REPO_SLUG",
  "NEXT_TELEMETRY_DISABLED",
])
const SKIP_PREFIXES = ["npm_", "VERCEL_GIT_", "GITHUB_"]

function shouldSkip(name: string): boolean {
  if (SKIP_VARS.has(name)) return true
  if (SKIP_PREFIXES.some(p => name.startsWith(p))) return true
  if (name.length < 3) return true
  return false
}

function parseEnvFile(content: string): string[] {
  return content
    .split("\n")
    .flatMap(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return []
      const m = trimmed.match(/^([A-Z][A-Z0-9_]{2,})\s*=/)
      return m && !shouldSkip(m[1]) ? [m[1]] : []
    })
}

function grepSourceCode(repoDir: string): string[] {
  const found = new Set<string>()
  const pattern = /process\.env\.([A-Z][A-Z0-9_]{2,})/g

  // TypeScript/JavaScript ファイルを再帰的に検索
  let files: string[] = []
  try {
    files = execSync(
      `find "${repoDir}" -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" \\) -not -path "*/node_modules/*" -not -path "*/.next/*"`,
      { stdio: "pipe" }
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
  } catch {
    return []
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8")
      let m: RegExpExecArray | null
      while ((m = pattern.exec(content)) !== null) {
        if (!shouldSkip(m[1])) found.add(m[1])
      }
      pattern.lastIndex = 0
    } catch {
      // 読めないファイルはスキップ
    }
  }

  return [...found]
}

async function scanRepo(slug: string, repo: string): Promise<string[]> {
  const found = new Set<string>()
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    // 1. .env.example 系ファイル
    for (const file of [".env.example", ".env.local.example", ".env.sample", "example.env"]) {
      const filePath = path.join(repoDir, file)
      if (fs.existsSync(filePath)) {
        const vars = parseEnvFile(fs.readFileSync(filePath, "utf-8"))
        vars.forEach(v => found.add(v))
        console.log(`  [${slug}] ${file}: ${vars.length} vars`)
      }
    }

    // 2. ソースコード全体を grep
    const sourceVars = grepSourceCode(repoDir)
    sourceVars.forEach(v => found.add(v))
    console.log(`  [${slug}] source grep: ${sourceVars.length} vars (total: ${found.size})`)

  } finally {
    if (repoDir) cleanup(repoDir)
  }

  return [...found]
}

async function upsertApiKey(envVarName: string, productSlug: string): Promise<void> {
  const { data: existing } = await supabase
    .schema("metago")
    .from("api_keys")
    .select("id, used_by")
    .eq("env_var_name", envVarName)
    .single()

  const now = new Date().toISOString()

  if (existing) {
    const usedBy: string[] = existing.used_by ?? []
    if (!usedBy.includes(productSlug)) usedBy.push(productSlug)
    await supabase
      .schema("metago")
      .from("api_keys")
      .update({ used_by: usedBy, last_seen_at: now })
      .eq("id", existing.id)
  } else {
    await supabase
      .schema("metago")
      .from("api_keys")
      .insert({
        env_var_name: envVarName,
        used_by: [productSlug],
        auto_detected: true,
        last_seen_at: now,
      })
  }
}

async function main() {
  console.log("=== API Keys Scanner (clone mode) ===")

  for (const [slug, repo] of Object.entries(GO_REPOS)) {
    console.log(`\nScanning ${slug} (${repo})...`)
    try {
      const vars = await scanRepo(slug, repo)
      console.log(`  → ${vars.length} env vars detected`)
      for (const v of vars) {
        await upsertApiKey(v, slug)
      }
    } catch (err) {
      console.error(`  Error scanning ${slug}:`, err)
    }
  }

  console.log("\n=== Done ===")
}

main().catch(console.error)
