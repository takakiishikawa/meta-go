/**
 * go-design-system 準拠チェック → 違反をDB保存 + Claude APIで自動修正PR作成 (L1)
 *
 * 判定基準: takakiishikawa/go-design-system の仕様に基づく
 *   - カラー: --color-* CSS変数を使用 (Tailwindパレット直書き禁止)
 *   - テキスト: --text-* CSS変数を使用 (px直書き禁止)
 *   - 角丸: rounded-xl 以上禁止 (--radius-lg = 6px が上限)
 *   - Shadow: shadow-* 系禁止 (border + --color-border-* を使う)
 *   - コンポーネント: DSコンポーネントを使用 (<button>/<input>等の素HTML禁止)
 *   - フォント: font-bold 禁止 (font-semibold を使う)
 *   - DesignTokens: app/layout.tsx での使用を推奨
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations"
import { fixViolationsWithClaude } from "../../lib/github/claude-api"

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

// ============================================================
// go-design-system の仕様から導いた違反パターン
// ============================================================

// Tailwind パレットカラー名 (DS定義外)
const TW_COLORS = [
  "red","orange","amber","yellow","lime","green","emerald","teal",
  "cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose",
  "slate","gray","zinc","neutral","stone",
].join("|")

// カラー系 Tailwind プレフィックス
const TW_COLOR_PREFIXES = [
  "text","bg","border","ring","fill","stroke","shadow","outline",
  "from","to","via","decoration","divide","placeholder","caret","accent",
].join("|")

interface ViolationRule {
  category: string
  severity: "high" | "medium" | "low"
  pattern: RegExp
  description: string
  rule: string
  penaltyPerHit: number
}

const VIOLATION_RULES: ViolationRule[] = [
  // ── 高優先度: カラー ───────────────────────────────────
  {
    category: "カラー/Tailwindパレット直書き",
    severity: "high",
    // text-blue-500, bg-red-100, border-green-300, etc.
    pattern: new RegExp(
      `(?:${TW_COLOR_PREFIXES})-(${TW_COLORS})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`,
      "g"
    ),
    description: "Tailwindパレットカラー直書き。go-design-systemのCSS変数(var(--color-*))を使用してください",
    rule: "className内のTailwindパレットカラー(text-blue-500等)はDS CSS変数(var(--color-*))またはDSコンポーネントpropsに置き換えてください",
    penaltyPerHit: 3,
  },
  {
    category: "カラー/任意カラー値直書き",
    severity: "high",
    // text-[#xxx], bg-[rgb(...)], etc.
    pattern: /(?:text|bg|border|ring|fill|stroke|from|to|via)-\[(?:#[0-9a-fA-F]{3,8}|rgb[a]?\()/g,
    description: "Tailwind arbitrary値でカラーを直接指定。var(--color-*)トークンを使用してください",
    rule: "className内のarbitrary color([#xxx]等)はvar(--color-*)に置き換えてください",
    penaltyPerHit: 5,
  },
  {
    category: "カラー/style属性hex直書き",
    severity: "high",
    // style={{ color: '#1E3A8A' }}, style={{ backgroundColor: 'rgb(30,58,138)' }}
    pattern: /style=\{[^}]*(?:color|background(?:Color)?|borderColor|fill|stroke):\s*['"](?:#[0-9a-fA-F]{3,8}|rgb[a]?\()/g,
    description: "style属性に直接カラーコード。var(--color-*)トークンを使用してください",
    rule: "style属性のcolor系プロパティはvar(--color-*)に置き換えてください",
    penaltyPerHit: 5,
  },

  // ── 高優先度: コンポーネント ───────────────────────────
  {
    category: "コンポーネント/素のbutton使用",
    severity: "high",
    // <button class= や <button onClick= (JSXの素HTML要素)
    pattern: /<button\s+(?:class|onClick|type|disabled)/g,
    description: "DSの<Button>コンポーネントではなく素の<button>を使用",
    rule: "<button>→go-design-systemの<Button>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のinput使用",
    severity: "high",
    pattern: /<input\s+(?:type|class|onChange|value|placeholder)/g,
    description: "DSの<Input>/<SearchInput>/<NumberInput>ではなく素の<input>を使用",
    rule: "<input>→go-design-systemの<Input>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のselect使用",
    severity: "high",
    pattern: /<select\s+(?:class|onChange|value|name)/g,
    description: "DSの<Select>/<Combobox>ではなく素の<select>を使用",
    rule: "<select>→go-design-systemの<Select>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のtextarea使用",
    severity: "medium",
    pattern: /<textarea\s+(?:class|onChange|value|rows|placeholder)/g,
    description: "DSの<Textarea>ではなく素の<textarea>を使用",
    rule: "<textarea>→go-design-systemの<Textarea>コンポーネントを使用してください",
    penaltyPerHit: 3,
  },

  // ── 中優先度: スタイル ────────────────────────────────
  {
    category: "スタイル/角丸超過",
    severity: "medium",
    // rounded-xl, rounded-2xl, rounded-3xl (DS上限はrounded-lg=6px)
    pattern: /rounded-(?:xl|2xl|3xl)\b/g,
    description: "go-design-system の角丸上限(--radius-lg=6px)を超えている。rounded-xl以上は禁止",
    rule: "rounded-xl以上はrounded-md(4px)またはrounded-lg(6px)に変更してください",
    penaltyPerHit: 2,
  },
  {
    category: "スタイル/shadow使用",
    severity: "medium",
    // shadow-sm, shadow-md, shadow-lg, shadow-xl, shadow-2xl
    pattern: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    description: "DSの設計指針では shadowより border+borderColor を優先する",
    rule: "shadow-*はborder + var(--color-border)に置き換えることを検討してください",
    penaltyPerHit: 1,
  },
  {
    category: "スタイル/フォントサイズpx直書き",
    severity: "medium",
    // style={{ fontSize: '12px' }}, style={{ fontSize: '0.75rem' }}
    pattern: /style=\{[^}]*fontSize:\s*['"]?(?:\d+px|\d*\.\d+rem)/g,
    description: "style属性のfontSizeにpx/rem直書き。var(--text-*)トークンを使用してください",
    rule: "style属性のfontSizeはvar(--text-xs|sm|base|lg|xl...)に置き換えてください",
    penaltyPerHit: 3,
  },
  {
    category: "スタイル/任意フォントサイズ",
    severity: "medium",
    // text-[12px], text-[0.75rem]
    pattern: /text-\[(?:\d+px|\d*\.\d+rem)\]/g,
    description: "Tailwind arbitrary値でフォントサイズ直書き。var(--text-*)を使用してください",
    rule: "text-[12px]等はvar(--text-*)またはDSのtext-xs等に置き換えてください",
    penaltyPerHit: 3,
  },

  // ── 低優先度: フォント ────────────────────────────────
  {
    category: "スタイル/font-bold使用",
    severity: "low",
    // font-bold (DS設計指針: semibold優先)
    pattern: /\bfont-bold\b/g,
    description: "go-design-systemの設計指針ではfont-bold(700)よりfont-semibold(600)を優先",
    rule: "font-bold→font-semiboldに変更することを検討してください",
    penaltyPerHit: 1,
  },
]

// ── ファイルスキャン ──────────────────────────────────────

function findTsxFiles(dir: string): string[] {
  const result: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", "dist"].includes(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) result.push(...findTsxFiles(fullPath))
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) result.push(fullPath)
    }
  } catch {}
  return result
}

// ── DesignTokens 使用チェック ──────────────────────────────

function checkDesignTokensUsage(repoDir: string): boolean {
  const layoutPaths = [
    path.join(repoDir, "app", "layout.tsx"),
    path.join(repoDir, "app", "layout.ts"),
    path.join(repoDir, "src", "app", "layout.tsx"),
  ]
  for (const p of layoutPaths) {
    if (!fs.existsSync(p)) continue
    const content = fs.readFileSync(p, "utf-8")
    if (content.includes("DesignTokens") || content.includes("go-design-system")) return true
  }
  return false
}

// ── スコア計算 ─────────────────────────────────────────────

function calcScore(violations: Array<{ penaltyPerHit: number; count: number }>): number {
  const totalPenalty = violations.reduce((s, v) => s + v.penaltyPerHit * v.count, 0)
  return Math.max(0, 100 - totalPenalty)
}

// ── シンプル違反の直接テキスト置換 (Claude不要) ──────────────

function applySimpleFixes(repoDir: string, files: string[]): void {
  const simpleFixes: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bfont-bold\b/g,          replacement: "font-semibold" },
    { pattern: /\brounded-2xl\b/g,        replacement: "rounded-lg" },
    { pattern: /\brounded-3xl\b/g,        replacement: "rounded-lg" },
    { pattern: /\brounded-xl\b/g,         replacement: "rounded-lg" },
    { pattern: /\bshadow-sm\b/g,          replacement: "border border-border" },
    { pattern: /\bshadow-md\b/g,          replacement: "border border-border" },
    { pattern: /\bshadow-lg\b/g,          replacement: "border border-border" },
    { pattern: /\bshadow-xl\b/g,          replacement: "border border-border" },
    { pattern: /\bshadow-2xl\b/g,         replacement: "border border-border" },
  ]

  for (const filePath of files) {
    try {
      let content = fs.readFileSync(filePath, "utf-8")
      let changed = false
      for (const fix of simpleFixes) {
        const next = content.replace(fix.pattern, fix.replacement)
        if (next !== content) { content = next; changed = true }
      }
      if (changed) fs.writeFileSync(filePath, content, "utf-8")
    } catch {}
  }
}

// ── メイン処理 ─────────────────────────────────────────────

interface FileViolation {
  file: string
  fullPath: string
  content: string
  issues: string[]
  category: string
  rule: string
}

async function analyzeRepo(product: any, repo: string) {
  console.log(`\n🎨 Design system: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    const files = findTsxFiles(repoDir)
    console.log(`  📂 Scanning ${files.length} files...`)

    // DesignTokens コンポーネント使用チェック
    const usesDesignTokens = checkDesignTokensUsage(repoDir)
    if (!usesDesignTokens) {
      console.log(`  ⚠️  <DesignTokens> not found in app/layout.tsx`)
    }

    // 違反集計
    const violationsByCategory = new Map<string, {
      rule: ViolationRule
      count: number
      fileViolations: FileViolation[]
    }>()

    for (const rule of VIOLATION_RULES) {
      violationsByCategory.set(rule.category, { rule, count: 0, fileViolations: [] })
    }

    for (const filePath of files) {
      let content: string
      try {
        content = fs.readFileSync(filePath, "utf-8")
      } catch {
        continue
      }
      const relPath = path.relative(repoDir, filePath)

      for (const rule of VIOLATION_RULES) {
        const matches = [...content.matchAll(new RegExp(rule.pattern.source, "g"))]
        if (matches.length === 0) continue

        const entry = violationsByCategory.get(rule.category)!
        entry.count += matches.length
        entry.fileViolations.push({
          file: relPath,
          fullPath: filePath,
          content,
          issues: matches.map((m) => m[0].substring(0, 80)),
          category: rule.category,
          rule: rule.rule,
        })
      }
    }

    // 既存レコードを削除してから新規挿入 (unique制約なしのためupsertは使わない)
    await supabase.schema("metago").from("design_system_items").delete().eq("product_id", product.id)

    // DB保存 & ログ出力
    let totalPenalty = 0
    const categorySummary: string[] = []

    for (const [category, entry] of violationsByCategory) {
      if (entry.count === 0) continue

      const penalty = entry.rule.penaltyPerHit * entry.count
      totalPenalty += penalty
      categorySummary.push(`${category}:${entry.count}件(-${penalty}pt)`)

      for (const fv of entry.fileViolations.slice(0, 10)) {
        await supabase.schema("metago").from("design_system_items").insert({
          product_id:  product.id,
          category:    category,
          title:       `${category}: ${fv.file}`,
          description: `${entry.rule.description} (${fv.issues.length}箇所) | ${fv.issues[0] ?? ""}`,
          state:       "new",
        })
      }
    }

    // DesignTokens 未使用も記録
    if (!usesDesignTokens) {
      totalPenalty += 10
      await supabase.schema("metago").from("design_system_items").insert({
        product_id:  product.id,
        category:    "設定/DesignTokens未使用",
        title:       "設定/DesignTokens未使用: app/layout.tsx",
        description: "app/layout.tsx で<DesignTokens>コンポーネントが見つかりません。go-design-systemのブランドカラーが適用されていない可能性があります",
        state:       "new",
      })
    }

    const score = Math.max(0, 100 - totalPenalty)
    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category:   "design_system",
      score,
    })

    console.log(`  score: ${score} (penalty: ${totalPenalty})`)
    if (categorySummary.length > 0) {
      console.log(`  violations:`)
      for (const s of categorySummary) console.log(`    ${s}`)
    } else {
      console.log(`  ✅ No violations found`)
    }

    // 先にシンプルな違反を直接テキスト置換で修正 (Claude不要)
    applySimpleFixes(repoDir, files)

    // Claude API で全severity違反を自動修正 (L1)
    const allViolations: FileViolation[] = []
    for (const entry of violationsByCategory.values()) {
      allViolations.push(...entry.fileViolations)
    }

    if (allViolations.length > 0) {
      // ファイル単位でユニーク化 (複数カテゴリの違反を1ファイルにまとめる)
      const fileMap = new Map<string, FileViolation & { rules: string[] }>()
      for (const v of allViolations) {
        const existing = fileMap.get(v.fullPath)
        if (existing) {
          existing.issues.push(...v.issues)
          if (!existing.rules.includes(v.rule)) existing.rules.push(v.rule)
        } else {
          // ファイルを再読み込み (simple fixes が適用済みの内容を使う)
          let content = v.content
          try { content = fs.readFileSync(v.fullPath, "utf-8") } catch {}
          fileMap.set(v.fullPath, { ...v, content, rules: [v.rule] })
        }
      }

      const patchTargets = [...fileMap.values()].slice(0, 15).map((v) => ({
        file: v.file,
        content: v.content,
        issues: v.issues.slice(0, 15),
      }))

      const rule = [
        "go-design-systemの仕様に従って以下の違反をすべて修正してください:",
        "1. Tailwindパレットカラー(text-blue-500等) → go-design-systemのCSS変数(var(--color-*))に変換",
        "2. style属性の#xxxxxx → var(--color-*)に変換",
        "3. <button>/<input>/<select>/<textarea> → go-design-systemの<Button>/<Input>/<Select>/<Textarea>に変換 (import追加も)",
        "4. rounded-xl/2xl/3xl → rounded-lg に変換",
        "5. shadow-sm/md/lg/xl/2xl → border border-border クラスに変換",
        "6. text-[12px]等の任意フォントサイズ → var(--text-xs)/var(--text-sm)等のDS変数に変換",
        "7. style属性のfontSize px/rem → var(--text-*)に変換",
        "8. font-bold → font-semibold に変換",
        "import元: @takaki/go-design-system",
      ].join("\n")

      console.log(`  🤖 Asking Claude to fix ${patchTargets.length} files (all severities)...`)
      const patches = await fixViolationsWithClaude(patchTargets, rule)

      for (const patch of patches) {
        const fullPath = path.join(repoDir, patch.filePath)
        if (fs.existsSync(fullPath)) {
          fs.writeFileSync(fullPath, patch.newContent, "utf-8")
        }
      }

      if (hasChanges(repoDir)) {
        const branch = `metago/design-system-${new Date().toISOString().slice(0, 10)}`
        const pushed = createBranchAndCommit(
          repoDir,
          branch,
          `fix(design-system): DSトークン・コンポーネント全違反修正 [L1 MetaGo]`
        )
        if (pushed) {
          await createAndMergePR(repo, {
            title: `🤖 [MetaGo L1] デザインシステム違反修正 — ${product.display_name}`,
            body: `MetaGo + Claude による go-design-system 準拠修正です。

**検出違反**
${categorySummary.map((s) => `- ${s}`).join("\n") || "- 違反なし"}

**修正内容**
- Tailwindパレットカラー → var(--color-*) CSS変数
- style属性ハードコードカラー → var(--color-*)
- 素のHTML要素(<button>/<input>/<select>/<textarea>) → DSコンポーネント
- rounded-xl/2xl/3xl → rounded-lg
- shadow-* → border border-border
- text-[Xpx] → var(--text-*)
- font-bold → font-semibold

修正ファイル数: ${patches.length} 件

> L1: 自動マージ対象。スタイルトークンとDSコンポーネントへの置き換えのみです。`,
            head: branch,
            labels: ["metago-auto-merge"],
          })
        }
      }
    }
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e)
    await supabase.schema("metago").from("execution_logs").insert({
      product_id: product.id,
      category:   "design-system",
      title:      `デザインシステムチェック失敗: ${repo}`,
      description: String(e),
      state:      "failed",
    })
  } finally {
    if (repoDir) cleanup(repoDir)
  }
}

async function main() {
  console.log("🚀 Starting design system compliance check (based on go-design-system spec)...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO

  for (const product of products) {
    const repo = GO_REPOS[product.name]
    if (!repo) continue
    if (targetRepo && repo !== targetRepo) continue
    await analyzeRepo(product, repo)
  }

  console.log("\n✅ Design system compliance check complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
