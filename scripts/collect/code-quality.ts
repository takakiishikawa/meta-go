/**
 * 各goのコード品質を評価軸ベースでClaudeが分析 → DB保存 + ESLint自動修正PR (L1)
 *
 * スコアはESLintの違反数ではなく、Claudeが7つの評価軸で実際にコードを読んで採点する。
 * ESLint/Prettierは引き続き自動修正 (L1) として実行されるが、スコアには影響しない。
 *
 * 評価軸:
 *   1. クリーンコード    — 命名/SRP/DRY/KISS
 *   2. 拡張性           — 抽象化/疎結合/OCP
 *   3. 可読性           — 構造/ロジックの明確さ/一貫性
 *   4. エラーハンドリング — 例外処理の網羅性/UX
 *   5. 型安全性         — TypeScript活用度/any回避
 *   6. コンポーネント設計 — 再利用性/責務分離/propsの適切さ
 *   7. テスト可能性      — 副作用の分離/依存性の注入可能性
 *
 * 環境変数:
 *   TARGET_REPO        — 対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 *   ANTHROPIC_API_KEY  — Claude API キー
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
  createAndMergePR,
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

// ============================================================
// 評価軸定義
// ============================================================

interface QualityAxis {
  id: string;
  name: string; // 日本語名（DBのcategoryに使用）
  weight: number; // スコア重み
  criterion: string; // Claudeへの評価基準説明
}

const QUALITY_AXES: QualityAxis[] = [
  {
    id: "clean_code",
    name: "クリーンコード",
    weight: 2.0,
    criterion: `
・変数名・関数名は意図を明確に表しているか（略語や1文字変数の過剰使用がないか）
・関数/コンポーネントは単一責任原則を守っているか（1つのことだけやっているか）
・DRY原則: 同じロジックが複数箇所にコピーされていないか
・マジックナンバー・ハードコード文字列が適切に定数化されているか
・関数の引数が多すぎないか（4個以上は要注意）`.trim(),
  },
  {
    id: "extensibility",
    name: "拡張性",
    weight: 2.0,
    criterion: `
・新機能追加時に既存コードを大きく変更しなくて済む設計か
・ハードコードされた条件分岐（if/switch）が今後の拡張を阻害しないか
・データ取得・ビジネスロジック・UI表示が適切に分離されているか
・設定値や定数が一元管理されているか
・コンポーネントのpropsが柔軟か（固すぎず複雑すぎず）`.trim(),
  },
  {
    id: "readability",
    name: "可読性",
    weight: 1.5,
    criterion: `
・コードを読んで何をしているか直感的に理解できるか
・複雑なロジックに適切なコメントがあるか（自明でないものに限り）
・ファイルの長さが適切か（300行超は分割検討）
・ネストの深さが適切か（3段以上のネストは危険信号）
・関連するコードがまとまって配置されているか`.trim(),
  },
  {
    id: "error_handling",
    name: "エラーハンドリング",
    weight: 2.0,
    criterion: `
・API呼び出し・非同期処理にエラーハンドリングがあるか（try/catch、.catch）
・エラー時にユーザーに適切なフィードバックがあるか（エラーメッセージ表示）
・エラーが握り潰されていないか（空のcatchブロック）
・型に nullable な値を適切に処理しているか（null/undefined チェック）
・フォームのバリデーションエラーが適切に処理されているか`.trim(),
  },
  {
    id: "type_safety",
    name: "型安全性",
    weight: 1.5,
    criterion: `
・any型の使用が最小限に抑えられているか
・外部API・DBのレスポンスに適切な型定義があるか
・型ガードが適切に使われているか（as でのキャストに頼りすぎていないか）
・Props の型定義が適切か（省略可能フィールドが明示されているか）
・型定義ファイルが整理されているか`.trim(),
  },
  {
    id: "component_design",
    name: "コンポーネント設計",
    weight: 2.0,
    criterion: `
・コンポーネントの粒度が適切か（大きすぎず小さすぎず）
・再利用可能なコンポーネントが適切に抽出されているか
・ページコンポーネントにビジネスロジックが入り込んでいないか
・Clientコンポーネントの範囲が最小化されているか（Server Componentsの活用）
・コンポーネント間のデータフローが明確か（props drilling が深くないか）`.trim(),
  },
  {
    id: "testability",
    name: "テスト可能性",
    weight: 1.0,
    criterion: `
・副作用（API呼び出し、localStorage等）が関数内に混在しておらず、分離しやすい構造か
・テストを書こうとしたときに外部依存を差し替えられる設計か
・純粋関数（同じ入力→同じ出力）が多く、ロジックが独立しているか
・グローバルな状態への依存が最小か`.trim(),
  },
];

// ============================================================
// Claude による評価
// ============================================================

interface AxisEvaluation {
  axisId: string;
  score: number; // 0-100
  findings: Array<{
    title: string;
    description: string;
    severity: "high" | "medium" | "low";
    file?: string;
  }>;
}

interface ClaudeEvaluationResult {
  axes: AxisEvaluation[];
  overallScore: number;
}

function collectSourceFiles(repoDir: string): string {
  let files: string[] = [];
  try {
    // 重要度順: app/ > components/ > lib/ > hooks/、ファイルサイズ降順
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" ` +
        `-not -name "*.test.*" -not -name "*.spec.*" ` +
        `\\( -path "./app/*" -o -path "./components/*" -o -path "./lib/*" -o -path "./hooks/*" \\) ` +
        `| xargs ls -S 2>/dev/null | head -40`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    try {
      files = execSync(
        `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
          `-not -path "./node_modules/*" -not -path "./.next/*" | head -30`,
        { cwd: repoDir, stdio: "pipe" },
      )
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      return "";
    }
  }

  const sections: string[] = [];
  let totalChars = 0;
  const MAX_CHARS = 70_000;

  for (const f of files) {
    const filePath = path.isAbsolute(f) ? f : path.join(repoDir, f);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (totalChars + content.length > MAX_CHARS) break;
      const relPath = path.relative(repoDir, filePath);
      sections.push(`=== ${relPath} ===\n${content}`);
      totalChars += content.length;
    } catch {}
  }

  console.log(
    `  収集ファイル数: ${sections.length} (${Math.round(totalChars / 1000)}KB)`,
  );
  return sections.join("\n\n");
}

async function evaluateCodeQuality(
  repoDir: string,
  productName: string,
  anthropic: Anthropic,
): Promise<ClaudeEvaluationResult> {
  const sourceCode = collectSourceFiles(repoDir);
  if (!sourceCode) {
    console.warn("  ソースコードが取得できませんでした");
    return { axes: [], overallScore: 0 };
  }

  const axesDescription = QUALITY_AXES.map(
    (ax) => `### ${ax.name} (id: ${ax.id})\n${ax.criterion}`,
  ).join("\n\n");

  const prompt = `あなたはNext.js/TypeScriptアプリの経験豊富なシニアエンジニアです。
「${productName}」のソースコードを以下の7つの評価軸で客観的に採点してください。

## 評価軸と基準

${axesDescription}

## ソースコード

${sourceCode}

## 採点ルール

- 各軸を 0〜100 点で採点する（100点満点の厳しい採点基準で）
- 点数の目安: 90+ = 模範的, 75-89 = 良好, 60-74 = 改善余地あり, 40-59 = 問題あり, 0-39 = 深刻な問題
- コードに実際に存在する問題のみを報告する（推測・汎用アドバイスは不要）
- 各軸で最大4件の具体的な問題点を日本語で記載する

## 出力形式

以下のJSONのみを返してください（説明文・マークダウン不要）:

{
  "axes": [
    {
      "axisId": "clean_code",
      "score": 72,
      "findings": [
        {
          "title": "短い問題タイトル（50文字以内）",
          "description": "なぜ問題か、何が起きるかの具体的説明（250文字以内）",
          "severity": "high",
          "file": "app/page.tsx"
        }
      ]
    }
  ]
}`;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  🤖 Claude評価実行中... (試行 ${attempt}/${MAX_RETRIES})`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        message.content[0]?.type === "text" ? message.content[0].text : "";
      const cleaned = text
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      let parsed: { axes: AxisEvaluation[] };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // JSON部分だけ抽出
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("JSONが見つかりません");
        parsed = JSON.parse(jsonMatch[0]);
      }

      const axes = parsed.axes ?? [];

      // 加重平均スコア計算
      let totalWeight = 0;
      let weightedSum = 0;
      for (const ax of axes) {
        const def = QUALITY_AXES.find((q) => q.id === ax.axisId);
        if (!def) continue;
        weightedSum += ax.score * def.weight;
        totalWeight += def.weight;
      }
      const overallScore =
        totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

      // 評価結果をログ出力
      console.log(`  📊 評価結果:`);
      for (const ax of axes) {
        const def = QUALITY_AXES.find((q) => q.id === ax.axisId);
        const label = def?.name ?? ax.axisId;
        const bar =
          "█".repeat(Math.round(ax.score / 10)) +
          "░".repeat(10 - Math.round(ax.score / 10));
        console.log(
          `     ${label.padEnd(14)}: ${String(ax.score).padStart(3)}点 ${bar} (${ax.findings.length}件の問題)`,
        );
      }
      console.log(`  🏆 総合スコア: ${overallScore}点`);

      return { axes, overallScore };
    } catch (e: any) {
      const isRateLimit =
        e?.status === 429 || e?.error?.error?.type === "rate_limit_error";
      if (isRateLimit && attempt < MAX_RETRIES) {
        const wait = 60_000 * attempt;
        console.warn(
          `  レート制限 (${attempt}/${MAX_RETRIES}回目)、${wait / 1000}秒待機...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.warn("  Claude評価失敗:", String(e).slice(0, 300));
      return { axes: [], overallScore: 0 };
    }
  }
  return { axes: [], overallScore: 0 };
}

// ============================================================
// ESLint / Prettier / TSC 自動修正（スコアには影響しない）
// ============================================================

interface LintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  severity: number;
}
interface LintResult {
  filePath: string;
  messages: LintMessage[];
}

async function fixTscErrors(
  repoDir: string,
  anthropic: Anthropic,
): Promise<void> {
  let tscOutput = "";
  try {
    execSync("npx tsc --noEmit", {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 120_000,
    });
    console.log("  TSC: エラーなし");
    return;
  } catch (e: any) {
    tscOutput = e.stdout?.toString() ?? "";
  }

  const errorLines = tscOutput
    .split("\n")
    .filter((l) => l.includes(": error TS"));
  if (errorLines.length === 0) return;
  console.log(`  TSC: ${errorLines.length}件のエラーを検出 → Claude修正開始`);

  // エラーをファイルごとにグループ化
  const fileErrors = new Map<string, string[]>();
  for (const line of errorLines) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error /);
    if (!m) continue;
    const file = m[1].trim();
    if (!fileErrors.has(file)) fileErrors.set(file, []);
    fileErrors.get(file)!.push(line);
  }

  for (const [file, errors] of fileErrors) {
    const filePath = path.join(repoDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    if (content.length > 80_000) {
      console.warn(`  スキップ (ファイル大): ${file}`);
      continue;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Fix the TypeScript compiler errors listed below. Return ONLY the complete fixed file content — no explanation, no markdown fences.

File: ${file}

Errors:
${errors.join("\n")}

Current content:
\`\`\`tsx
${content}
\`\`\``,
            },
          ],
        });
        const raw =
          message.content[0]?.type === "text" ? message.content[0].text : "";
        const fixed = raw
          .replace(/^```[^\n]*\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        if (fixed && fixed !== content) {
          fs.writeFileSync(filePath, fixed, "utf-8");
          console.log(`  ✓ TSC修正: ${file} (${errors.length}件)`);
        }
        break;
      } catch (e: any) {
        if (e?.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 60_000 * attempt));
          continue;
        }
        console.warn(`  TSC修正失敗 (${file}):`, String(e).slice(0, 100));
        break;
      }
    }
  }
}

async function runLintAndFix(
  repoDir: string,
  anthropic: Anthropic,
): Promise<{ hasLintIssues: boolean }> {
  // deps install
  try {
    execSync("npm ci", { cwd: repoDir, stdio: "pipe", timeout: 300_000 });
    console.log("  npm ci: OK");
  } catch {
    try {
      execSync("npm install --legacy-peer-deps", {
        cwd: repoDir,
        stdio: "pipe",
        timeout: 300_000,
      });
      console.log("  npm install: OK");
    } catch (e: any) {
      console.warn(
        "  deps install failed:",
        e.stderr?.toString().slice(0, 100),
      );
    }
  }

  // TS/TSXファイル数（診断用）
  try {
    const count = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) -not -path "./node_modules/*" -not -path "./.next/*" | wc -l`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim();
    console.log(`  TS/TSXファイル数: ${count}`);
  } catch {}

  let hasLintIssues = false;

  // ESLint --fix
  try {
    execSync(
      `npx eslint . --ext .ts,.tsx --fix --ignore-pattern '.next' --ignore-pattern 'node_modules'`,
      { cwd: repoDir, stdio: "pipe", timeout: 120_000 },
    );
  } catch {
    hasLintIssues = true;
  }

  // Prettier
  try {
    execSync(`npx prettier --write "**/*.{ts,tsx,js,json,css}"`, {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch {}

  // TSC エラーを Claude で修正
  await fixTscErrors(repoDir, anthropic);

  const changed = hasChanges(repoDir);
  console.log(`  ESLint/Prettier/TSC: ${changed ? "修正あり" : "修正なし"}`);
  return { hasLintIssues };
}

// ============================================================
// メイン処理
// ============================================================

async function processRepo(product: any, repo: string) {
  console.log(`\n🔍 コード品質評価: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    repoDir = cloneRepo(repo);

    // 1. 既存レコードを全削除（clone成功後すぐに実行し、古いデータを常にクリア）
    await supabase
      .schema("metago")
      .from("quality_items")
      .delete()
      .eq("product_id", product.id);

    // 2. Claude による7軸評価（スコアの根拠）
    const evaluation = await evaluateCodeQuality(
      repoDir,
      product.display_name,
      anthropic,
    );

    // 3. ESLint/Prettier/TSC 自動修正（L1 PR用、スコアに影響しない）
    const { hasLintIssues } = await runLintAndFix(repoDir, anthropic);

    // 4. 評価軸ごとの問題をDBに保存（評価軸が空の場合は何も挿入しない）
    for (const axisResult of evaluation.axes) {
      const def = QUALITY_AXES.find((q) => q.id === axisResult.axisId);
      if (!def) continue;

      for (const finding of axisResult.findings) {
        await supabase
          .schema("metago")
          .from("quality_items")
          .insert({
            product_id: product.id,
            category: def.name,
            title: finding.title.substring(0, 200),
            description: finding.file
              ? `[${finding.file}] ${finding.description}`.substring(0, 500)
              : finding.description.substring(0, 500),
            state: "new",
            level: finding.severity === "high" ? "L1" : "L2",
          });
      }

      // 軸スコアが低い場合はサマリーも追加
      if (axisResult.score < 60) {
        await supabase
          .schema("metago")
          .from("quality_items")
          .insert({
            product_id: product.id,
            category: def.name,
            title: `[${def.name}] スコア低下: ${axisResult.score}点`,
            description: `${def.name}の評価が${axisResult.score}点と基準(60点)を下回っています。${def.criterion.split("\n")[0]}`,
            state: "new",
            level: axisResult.score < 40 ? "L1" : "L2",
          });
      }
    }

    // 5. スコア保存（Claudeの加重平均 — API失敗時はスキップ）
    const score = evaluation.overallScore;
    if (evaluation.axes.length > 0) {
      await supabase.schema("metago").from("scores_history").insert({
        product_id: product.id,
        category: "quality",
        score,
      });
    } else {
      console.warn("  スコア保存スキップ: 評価軸が空（API失敗の可能性）");
    }

    // 6. L1 自動修正 PR (ESLint/Prettier のみ)
    if (hasChanges(repoDir)) {
      const branch = `metago/code-quality-${new Date().toISOString().slice(0, 10)}`;
      const pushed = createBranchAndCommit(
        repoDir,
        branch,
        `fix(code-quality): ESLint auto-fix / Prettier [L1 MetaGo]`,
      );
      if (pushed) {
        await createAndMergePR(repo, {
          title: `🤖 [MetaGo L1] コード品質自動修正 — ${product.display_name}`,
          body: `MetaGo による ESLint 自動修正・Prettier 整形・TypeScript エラー修正です。

> L1: 自動マージ対象。コードロジックへの変更はありません。`,
          head: branch,
          labels: ["metago-auto-merge"],
        });
      }
    }

    console.log(
      `  ✅ 完了: 総合スコア ${score}点、問題 ${evaluation.axes.reduce((s, a) => s + a.findings.length, 0)}件`,
    );
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "code-quality",
        title: `コード品質チェック失敗: ${repo}`,
        description: String(e),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 コード品質評価開始（7軸 Claude分析）...");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  const targetRepo = process.env.TARGET_REPO;

  for (const product of products) {
    const repo = GO_REPOS[product.name];
    if (!repo) continue;
    if (targetRepo && repo !== targetRepo) continue;
    await processRepo(product, repo);
  }

  console.log("\n✅ コード品質評価完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
