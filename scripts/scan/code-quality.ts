/**
 * code-quality SCAN
 *
 * Claude が7軸でコードを評価 → 問題itemをUPSERT + score保存
 * ESLint/Prettier/TSC修正PRは fix-cron に委譲
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Claude Code Max プラン、Anthropic API 課金なし)
 * 前提: ワークフロー側で `npm install -g @anthropic-ai/claude-code` 済み
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
  upsertItem,
  reviveResolvedItems,
  markStaleItemsResolved,
  resetStaleFailedItems,
} from "../../lib/metago/items";
import { runClaudeForJSON } from "../../lib/metago/claude-cli";

const supabase = getSupabase();

interface QualityAxis {
  id: string;
  name: string;
  weight: number;
  criterion: string;
}

const QUALITY_AXES: QualityAxis[] = [
  {
    id: "clean_code",
    name: "クリーンコード",
    weight: 2.0,
    criterion: `
・変数名・関数名は意図を明確に表しているか
・関数/コンポーネントは単一責任原則を守っているか
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
・ハードコードされた条件分岐が今後の拡張を阻害しないか
・データ取得・ビジネスロジック・UI表示が適切に分離されているか
・設定値や定数が一元管理されているか
・コンポーネントのpropsが柔軟か`.trim(),
  },
  {
    id: "readability",
    name: "可読性",
    weight: 1.5,
    criterion: `
・コードを読んで何をしているか直感的に理解できるか
・複雑なロジックに適切なコメントがあるか
・ファイルの長さが適切か（300行超は分割検討）
・ネストの深さが適切か（3段以上のネストは危険信号）
・関連するコードがまとまって配置されているか`.trim(),
  },
  {
    id: "error_handling",
    name: "エラーハンドリング",
    weight: 2.0,
    criterion: `
・API呼び出し・非同期処理にエラーハンドリングがあるか
・エラー時にユーザーに適切なフィードバックがあるか
・エラーが握り潰されていないか
・null/undefined チェックが適切か
・フォームのバリデーションエラーが適切に処理されているか`.trim(),
  },
  {
    id: "type_safety",
    name: "型安全性",
    weight: 1.5,
    criterion: `
・any型の使用が最小限に抑えられているか
・外部API・DBのレスポンスに適切な型定義があるか
・型ガードが適切に使われているか
・Props の型定義が適切か
・型定義ファイルが整理されているか`.trim(),
  },
  {
    id: "component_design",
    name: "コンポーネント設計",
    weight: 2.0,
    criterion: `
・コンポーネントの粒度が適切か
・再利用可能なコンポーネントが適切に抽出されているか
・ページコンポーネントにビジネスロジックが入り込んでいないか
・Clientコンポーネントの範囲が最小化されているか
・コンポーネント間のデータフローが明確か`.trim(),
  },
  {
    id: "testability",
    name: "テスト可能性",
    weight: 1.0,
    criterion: `
・副作用が関数内に混在しておらず、分離しやすい構造か
・テストを書こうとしたときに外部依存を差し替えられる設計か
・純粋関数が多く、ロジックが独立しているか
・グローバルな状態への依存が最小か`.trim(),
  },
];

interface AxisEvaluation {
  axisId: string;
  score: number;
  findings: Array<{
    title: string;
    description: string;
    severity: "high" | "medium" | "low";
    file?: string;
  }>;
}

function collectSourceFiles(repoDir: string): string {
  let files: string[] = [];
  try {
    files = execSync(
      // root 直置き (./app/...) と src/ レイアウト (./src/app/...) の両方をサポート
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" ` +
        `-not -name "*.test.*" -not -name "*.spec.*" ` +
        `\\( -path "./app/*" -o -path "./components/*" -o -path "./lib/*" -o -path "./hooks/*" ` +
        `   -o -path "./src/*" \\) ` +
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
): Promise<{ axes: AxisEvaluation[]; overallScore: number }> {
  const sourceCode = collectSourceFiles(repoDir);
  if (!sourceCode) return { axes: [], overallScore: 0 };

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

- 各軸を 0〜100 点で採点する
- 90+ = 模範的, 75-89 = 良好, 60-74 = 改善余地あり, 40-59 = 問題あり, 0-39 = 深刻
- コードに実際に存在する問題のみを報告
- 各軸で最大4件の具体的な問題点を日本語で記載

## 出力形式

以下のJSONのみを返してください:

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

  try {
    console.log(`  🤖 Claude評価実行中...`);
    const parsed = await runClaudeForJSON<{ axes: AxisEvaluation[] }>(prompt);
    const axes = parsed.axes ?? [];

    let totalWeight = 0;
    let weightedSum = 0;
    for (const ax of axes) {
      const def = QUALITY_AXES.find((q) => q.id === ax.axisId);
      if (!def) continue;
      weightedSum += ax.score * def.weight;
      totalWeight += def.weight;
    }

    if (totalWeight === 0) {
      console.warn("  ⚠️ 全axisIdが不一致、保存スキップ");
      return { axes: [], overallScore: 0 };
    }

    const overallScore = Math.round(weightedSum / totalWeight);
    console.log(`  🏆 総合スコア: ${overallScore}点`);
    return { axes, overallScore };
  } catch (e) {
    console.warn("  Claude評価失敗:", String(e).slice(0, 300));
    return { axes: [], overallScore: 0 };
  }
}

async function scanRepo(product: any, repo: string) {
  console.log(`\n🔍 [SCAN] code-quality: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;
  const scanStartedAt = new Date();

  try {
    repoDir = cloneRepo(repo);

    const evaluation = await evaluateCodeQuality(repoDir, product.display_name);

    if (evaluation.axes.length === 0) {
      console.warn("  評価失敗のためスキップ（既存スコア・itemsは保持）");
      return;
    }

    // 各軸の findings を (file, axis) 単位で集約して UPSERT。
    // title = file (ファイル不明なら GENERAL_LABEL) を安定キーとして使うことで
    // Claude のタイトルゆらぎ (日替わりで完全入れ替わり) を吸収し、
    // markStaleItemsResolved が意味のある解決検知として機能する。
    const GENERAL_LABEL = "(プロジェクト全体)";
    for (const axisResult of evaluation.axes) {
      const def = QUALITY_AXES.find((q) => q.id === axisResult.axisId);
      if (!def) continue;

      const byFile = new Map<
        string,
        { descs: string[]; severities: Array<"high" | "medium" | "low"> }
      >();
      for (const finding of axisResult.findings) {
        const fileKey = finding.file ?? GENERAL_LABEL;
        const bucket = byFile.get(fileKey) ?? { descs: [], severities: [] };
        bucket.descs.push(finding.description);
        bucket.severities.push(finding.severity);
        byFile.set(fileKey, bucket);
      }

      for (const [file, { descs, severities }] of byFile) {
        const hasHigh = severities.includes("high");
        await upsertItem(supabase, "quality_items", {
          product_id: product.id,
          category: def.name,
          title: file,
          description: descs.join(" / "),
          level: hasHigh ? "L1" : "L2",
        });
      }

      // 「スコア低下サマリ」は意図的に出力しない: title にスコア値が入ると
      // 日々ゆらぎ、安定キーの前提を壊す。スコア自体は scores_history で別途
      // 保存・可視化されている。
    }

    await saveScore(supabase, product.id, "quality", evaluation.overallScore);

    const evaluatedCategories = evaluation.axes
      .map((a) => QUALITY_AXES.find((q) => q.id === a.axisId)?.name)
      .filter((c): c is string => Boolean(c));

    // 再検出されたのに state='fixed' のままになっているゾンビを 'new' に戻す。
    const revived = await reviveResolvedItems(
      supabase,
      "quality_items",
      product.id,
      scanStartedAt,
      evaluatedCategories,
    );

    // attempt_count 上限スタックの 'failed' item をクールダウン経過後に 'new' に戻す。
    const reset = await resetStaleFailedItems(
      supabase,
      "quality_items",
      product.id,
      scanStartedAt,
      3,
      evaluatedCategories,
    );

    // 今回 scan で再検出されなかった items を 'fixed' に確定させる。
    // (file, axis) 単位の安定キーになったので、tuple overlap 70%+ が見込め churn しない。
    const resolved = await markStaleItemsResolved(
      supabase,
      "quality_items",
      product.id,
      scanStartedAt,
      evaluatedCategories,
    );

    console.log(
      `  ✅ score: ${evaluation.overallScore}点、findings: ${evaluation.axes.reduce((s, a) => s + a.findings.length, 0)}件${revived > 0 ? `, ${revived} revived` : ""}${resolved > 0 ? `, ${resolved} resolved` : ""}${reset > 0 ? `, ${reset} reset` : ""}`,
    );
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "code-quality-scan",
        title: `code-quality scan失敗: ${repo}`,
        description: String(e).slice(0, 500),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [SCAN] code-quality (7軸 Claude評価)");

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

  console.log("\n✅ [SCAN] code-quality complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
