/**
 * 各goリポジトリのソースコードをスキャンして環境変数（API Key名）を収集する
 *
 * 収集方法:
 * 1. .env.example / .env.local.example を取得してパース
 * 2. ソースコード内の process.env.XXXX パターンを検索（GitHub Code Search API）
 * 3. next.config.ts の env セクションをパース
 *
 * 結果を metago.api_keys テーブルに upsert する（env_var_name が一意キー）
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// slug → repoName のマッピング
const GO_REPOS: Record<string, string> = {
  nativego:   "native-go",
  carego:     "care-go",
  kenyakugo:  "kenyaku-go",
  cookgo:     "cook-go",
  physicalgo: "physical-go",
  taskgo:     "task-go",
}

// 自動提供されるため除外する変数名
const SKIP_VARS = new Set([
  "NODE_ENV", "PORT", "HOST", "CI", "TZ", "PATH",
  "NEXT_RUNTIME", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_PROVIDER", "VERCEL_GIT_REPO_SLUG",
])

// system prefix は除外
const SKIP_PREFIXES = ["npm_", "VERCEL_GIT_", "GITHUB_"]

function shouldSkip(name: string): boolean {
  if (SKIP_VARS.has(name)) return true
  if (SKIP_PREFIXES.some(p => name.startsWith(p))) return true
  if (name.length < 3) return true
  return false
}

async function githubFetch(path: string, raw = false): Promise<string | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: raw
        ? "application/vnd.github.v3.raw"
        : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!res.ok) return null
  return raw ? res.text() : JSON.stringify(await res.json())
}

function parseEnvFile(content: string): string[] {
  const vars: string[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Z][A-Z0-9_]{2,})\s*=/)
    if (match && !shouldSkip(match[1])) vars.push(match[1])
  }
  return vars
}

function parseSourceCode(content: string): string[] {
  const vars: string[] = []
  const pattern = /process\.env\.([A-Z][A-Z0-9_]{2,})/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    if (!shouldSkip(match[1])) vars.push(match[1])
  }
  return vars
}

async function scanRepo(slug: string, repo: string): Promise<string[]> {
  const found = new Set<string>()
  const repoPath = `/repos/${GITHUB_OWNER}/${repo}`

  // 1. .env.example 系ファイルを試す
  const envFiles = [
    ".env.example",
    ".env.local.example",
    ".env.sample",
    "example.env",
    ".env.template",
  ]
  for (const file of envFiles) {
    const content = await githubFetch(`${repoPath}/contents/${file}`, true)
    if (content) {
      parseEnvFile(content).forEach(v => found.add(v))
      console.log(`  [${slug}] ${file}: ${found.size} vars found`)
    }
  }

  // 2. GitHub Code Search で process.env パターンを検索
  // Rate limit: 10 req/min → 短いsleep を入れる
  await new Promise(r => setTimeout(r, 6000))

  const searchQuery = encodeURIComponent(
    `process.env repo:${GITHUB_OWNER}/${repo} language:TypeScript`
  )
  const searchRaw = await githubFetch(
    `/search/code?q=${searchQuery}&per_page=30`
  )

  if (searchRaw) {
    const searchData = JSON.parse(searchRaw)
    const items = searchData.items ?? []

    for (const item of items.slice(0, 10)) {
      // 各ファイルを取得してパース（rate limit対策で間隔を開ける）
      await new Promise(r => setTimeout(r, 1500))
      const fileContent = await githubFetch(
        `${repoPath}/contents/${item.path}`,
        true
      )
      if (fileContent) {
        parseSourceCode(fileContent).forEach(v => found.add(v))
      }
    }
    console.log(`  [${slug}] code search: ${found.size} total vars`)
  }

  // 3. next.config.ts / next.config.js も確認
  for (const configFile of ["next.config.ts", "next.config.js", "next.config.mjs"]) {
    const content = await githubFetch(`${repoPath}/contents/${configFile}`, true)
    if (content) {
      parseSourceCode(content).forEach(v => found.add(v))
    }
  }

  return [...found]
}

async function upsertApiKeys(
  envVarName: string,
  productSlug: string
): Promise<void> {
  // env_var_name で upsert し、used_by に productSlug を追加
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
  console.log("=== API Keys Scanner ===")

  for (const [slug, repo] of Object.entries(GO_REPOS)) {
    console.log(`\nScanning ${slug} (${repo})...`)
    try {
      const vars = await scanRepo(slug, repo)
      console.log(`  Found ${vars.length} env vars`)

      for (const v of vars) {
        await upsertApiKeys(v, slug)
      }
    } catch (err) {
      console.error(`  Error scanning ${slug}:`, err)
    }
  }

  console.log("\n=== Done ===")
}

main().catch(console.error)
