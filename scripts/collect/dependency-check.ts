/**
 * 週次: 各goの依存パッケージを精査し、自動更新PRを作成する
 *
 * - patch/minor: L1 自動マージ
 * - major:       L2 承認待ち
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import {
  GITHUB_OWNER,
  GITHUB_TOKEN,
  REPO_TO_SLUG,
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  createReviewPR,
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
  taskgo:       "task-go",
  designsystem: "go-design-system",
  metago:       "meta-go",
}

interface OutdatedPackage {
  name: string
  current: string
  wanted: string
  latest: string
  updateType: "patch" | "minor" | "major"
}

async function getOutdated(repoDir: string): Promise<OutdatedPackage[]> {
  let raw = ""
  try {
    raw = execSync("npm outdated --json", { cwd: repoDir, stdio: "pipe" }).toString()
  } catch (e: any) {
    raw = e.stdout?.toString() ?? "{}"
  }

  const data: Record<string, any> = JSON.parse(raw || "{}")
  const results: OutdatedPackage[] = []

  for (const [name, info] of Object.entries(data)) {
    if (!info.current || !info.latest) continue

    const cur = info.current.replace(/[^0-9.]/g, "").split(".").map(Number)
    const lat = info.latest.replace(/[^0-9.]/g, "").split(".").map(Number)

    let updateType: "patch" | "minor" | "major"
    if (lat[0] > cur[0]) updateType = "major"
    else if (lat[1] > cur[1]) updateType = "minor"
    else updateType = "patch"

    results.push({
      name,
      current: info.current,
      wanted: info.wanted ?? info.current,
      latest: info.latest,
      updateType,
    })
  }

  return results
}

async function processRepo(product: any, repo: string) {
  console.log(`\n📦 Dependency check: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    try {
      execSync("npm ci --prefer-offline", { cwd: repoDir, stdio: "pipe" })
    } catch {
      execSync("npm install --legacy-peer-deps", { cwd: repoDir, stdio: "pipe" })
    }

    const outdated = await getOutdated(repoDir)

    // DB に全件記録
    for (const pkg of outdated) {
      await supabase.schema("metago").from("dependency_items").upsert(
        {
          product_id: product.id,
          package_name: pkg.name,
          current_version: pkg.current,
          latest_version: pkg.latest,
          update_type: pkg.updateType,
          state: "new",
        },
        { onConflict: "product_id,package_name", ignoreDuplicates: false }
      )
    }

    const patchMinor = outdated.filter((p) => p.updateType === "patch" || p.updateType === "minor")
    const majorUpdates = outdated.filter((p) => p.updateType === "major")

    // L1: patch/minor 自動更新
    if (patchMinor.length > 0) {
      const packages = patchMinor.map((p) => `${p.name}@${p.latest}`).join(" ")
      try {
        execSync(`npm install ${packages} --save`, { cwd: repoDir, stdio: "pipe" })
      } catch (e) {
        console.warn(`  npm install failed for patch/minor:`, e)
      }

      if (hasChanges(repoDir)) {
        const branch = `metago/deps-l1-${new Date().toISOString().slice(0, 10)}`
        const pushed = createBranchAndCommit(
          repoDir,
          branch,
          `chore(deps): patch/minor 依存更新 [L1 MetaGo]`
        )
        if (pushed) {
          await createAndMergePR(repo, {
            title: `🤖 [MetaGo L1] patch/minor 依存更新 — ${product.display_name}`,
            body: `MetaGo による patch/minor 依存更新です。

**更新パッケージ (${patchMinor.length}件)**
${patchMinor.map((p) => `- \`${p.name}\`: ${p.current} → ${p.latest} (${p.updateType})`).join("\n")}

> L1: 自動マージ対象。`,
            head: branch,
            labels: ["metago-auto-merge"],
          })
          // 更新済みとしてマーク
          for (const pkg of patchMinor) {
            await supabase
              .schema("metago")
              .from("dependency_items")
              .update({ state: "done" })
              .eq("product_id", product.id)
              .eq("package_name", pkg.name)
          }
        }
      }
    }

    // L2: major 更新 → 承認待ちPR
    if (majorUpdates.length > 0) {
      // major 更新は別ブランチ（L1コミット後なので再クローンが必要）
      let majorRepoDir: string | null = null
      try {
        majorRepoDir = cloneRepo(repo)
        execSync("npm ci --prefer-offline", { cwd: majorRepoDir, stdio: "pipe" })

        const packages = majorUpdates.map((p) => `${p.name}@${p.latest}`).join(" ")
        execSync(`npm install ${packages} --save`, { cwd: majorRepoDir!, stdio: "pipe" })

        if (hasChanges(majorRepoDir)) {
          const branch = `metago/deps-l2-${new Date().toISOString().slice(0, 10)}`
          const pushed = createBranchAndCommit(
            majorRepoDir,
            branch,
            `chore(deps): major 依存更新 [L2 MetaGo承認待ち]`
          )
          if (pushed) {
            const pr = await createReviewPR(repo, {
              title: `🤖 [MetaGo L2] major 依存更新 — ${product.display_name}`,
              body: `MetaGo が検出した major 依存更新です。破壊的変更の可能性があるため承認が必要です。

**更新パッケージ (${majorUpdates.length}件)**
${majorUpdates.map((p) => `- \`${p.name}\`: ${p.current} → ${p.latest} ⚠️ major`).join("\n")}

> ⚠️ L2: MetaGo承認待ちです。動作確認後に承認してください。`,
              head: branch,
            })

            // approval_queue に追加
            await supabase.schema("metago").from("approval_queue").insert({
              product_id: product.id,
              title: `major依存更新: ${majorUpdates.map((p) => p.name).join(", ")}`,
              description: majorUpdates.map((p) => `${p.name}: ${p.current}→${p.latest}`).join("\n"),
              category: "dependency",
              state: "pending",
              meta: { pr_url: pr.url, level: "L2", repo },
            })
          }
        }
      } finally {
        if (majorRepoDir) cleanup(majorRepoDir)
      }
    }

    console.log(
      `  ✓ patch/minor: ${patchMinor.length}, major: ${majorUpdates.length}`
    )
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e)
    await supabase.schema("metago").from("execution_logs").insert({
      product_id: product.id,
      category: "dependency",
      title: `依存チェック失敗: ${repo}`,
      description: String(e),
      state: "failed",
    })
  } finally {
    if (repoDir) cleanup(repoDir)
  }
}

async function main() {
  console.log("🚀 Starting dependency check...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  for (const product of products) {
    const repo = GO_REPOS[product.name]
    if (!repo) continue
    await processRepo(product, repo)
  }

  console.log("\n✅ Dependency check complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
