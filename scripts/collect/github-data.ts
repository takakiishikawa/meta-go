/**
 * GitHub APIから各goのデータを収集し、metagoスキーマにUPSERTする
 *
 * 収集内容:
 * - Dependabotアラート（security_items）
 * - package.json依存関係（dependency_items）
 * - GitHub Actionsの最新CI状態
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GO_REPOS: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
}

async function githubFetch(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  if (!res.ok) {
    console.warn(`GitHub API ${path} returned ${res.status}`)
    return null
  }
  return res.json()
}

async function getProducts() {
  const { data } = await supabase.schema("metago").from("products").select("*")
  return data ?? []
}

async function collectDependabotAlerts(product: any, repo: string) {
  const alerts = await githubFetch(
    `/repos/${GITHUB_OWNER}/${repo}/dependabot/alerts?state=open&per_page=100`
  )
  if (!alerts || !Array.isArray(alerts)) return

  for (const alert of alerts) {
    const advisory = alert.security_advisory
    const { error } = await supabase.schema("metago").from("security_items").upsert(
      {
        product_id: product.id,
        severity: advisory.severity?.toLowerCase() ?? "medium",
        title: advisory.summary ?? `Dependabot Alert #${alert.number}`,
        cve: advisory.cve_id ?? null,
        description: advisory.description?.substring(0, 500) ?? null,
        state: alert.state === "fixed" ? "done" : "new",
      },
      {
        onConflict: "product_id,title",
        ignoreDuplicates: false,
      }
    )
    if (error) console.error("security_items upsert error:", error)
  }
  console.log(`✓ ${product.name}: ${alerts.length} Dependabot alerts collected`)
}

async function collectPackageJson(product: any, repo: string) {
  const content = await githubFetch(
    `/repos/${GITHUB_OWNER}/${repo}/contents/package.json`
  )
  if (!content?.content) return

  let pkg: any
  try {
    pkg = JSON.parse(Buffer.from(content.content, "base64").toString("utf-8"))
  } catch {
    console.warn(`Failed to parse package.json for ${product.name}`)
    return
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }

  // npm registry から最新バージョンを確認（主要パッケージのみ）
  const importantPackages = Object.entries(allDeps)
    .filter(([name]) =>
      ["next", "react", "react-dom", "@supabase/supabase-js", "@supabase/ssr", "typescript"].includes(name)
    )
    .slice(0, 20)

  for (const [packageName, currentVersion] of importantPackages) {
    const ver = String(currentVersion).replace(/[\^~>=<]/, "")
    try {
      const npmData = await fetch(`https://registry.npmjs.org/${packageName}/latest`).then((r) =>
        r.json()
      )
      const latestVersion = npmData.version
      if (!latestVersion || latestVersion === ver) continue

      const [curMajor, curMinor] = ver.split(".").map(Number)
      const [latMajor, latMinor] = latestVersion.split(".").map(Number)
      const updateType =
        latMajor > curMajor ? "major" : latMinor > curMinor ? "minor" : "patch"

      await supabase.schema("metago").from("dependency_items").upsert(
        {
          product_id: product.id,
          package_name: packageName,
          current_version: ver,
          latest_version: latestVersion,
          update_type: updateType,
          state: "new",
        },
        { onConflict: "product_id,package_name", ignoreDuplicates: false }
      )
    } catch (e) {
      console.warn(`Failed to check ${packageName}:`, e)
    }
  }
  console.log(`✓ ${product.name}: dependencies checked`)
}

async function main() {
  console.log("🚀 Starting GitHub data collection...")
  const products = await getProducts()

  for (const product of products) {
    const repo = GO_REPOS[product.name]
    if (!repo) {
      console.warn(`No repo mapping for ${product.name}`)
      continue
    }
    console.log(`\n📦 Processing ${product.display_name} (${GITHUB_OWNER}/${repo})`)
    await collectDependabotAlerts(product, repo)
    await collectPackageJson(product, repo)
  }

  console.log("\n✅ GitHub data collection complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
