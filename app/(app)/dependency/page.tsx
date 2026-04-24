import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system";
import { ExternalLink, Package, Layers } from "lucide-react";

// ---------------------------------------------------------
// カテゴリ設定
// ---------------------------------------------------------
const CATEGORY_CONFIG: Record<string, { color: string; order: number }> = {
  フレームワーク: { color: "#1E3A8A", order: 1 },
  "UI / デザイン": { color: "#6554C0", order: 2 },
  "バックエンド / DB": { color: "#00875A", order: 3 },
  "AI / ML": { color: "#FF5630", order: 4 },
  決済: { color: "#FF991F", order: 5 },
  "フォーム / バリデーション": { color: "#00B8D9", order: 6 },
  ユーティリティ: { color: "#6B7280", order: 7 },
  その他: { color: "#9CA3AF", order: 8 },
};

const CATEGORY_ORDER = Object.entries(CATEGORY_CONFIG)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

const UPDATE_TYPE_COLORS: Record<string, string> = {
  patch: "#36B37E",
  minor: "#FF991F",
  major: "#FF5630",
  framework: "#6554C0",
};

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  in_progress: "対応中",
  done: "完了",
};

// ---------------------------------------------------------
// 子コンポーネント
// ---------------------------------------------------------

function PackageChip({ name, color }: { name: string; color: string }) {
  const display = name
    .replace("@takaki/", "")
    .replace("@supabase/", "supabase/")
    .replace("@ai-sdk/", "ai-sdk/")
    .replace("@anthropic-ai/", "anthropic/")
    .replace("@hookform/", "hookform/")
    .replace("react-hook-form", "react-hook-form");

  return (
    <span
      title={name}
      className="rounded px-1.5 py-0.5 text-xs font-mono leading-relaxed"
      style={{
        backgroundColor: color + "1A",
        color: color,
        border: `1px solid ${color}33`,
      }}
    >
      {display}
    </span>
  );
}

function CategorySection({
  category,
  items,
}: {
  category: string;
  items: { package_name: string }[];
}) {
  const color = CATEGORY_CONFIG[category]?.color ?? "#6B7280";
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
        style={{ color }}
      >
        {category}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <PackageChip
            key={item.package_name}
            name={item.package_name}
            color={color}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Page
// ---------------------------------------------------------

export default async function DependencyPage() {
  const supabase = await createClient();

  const [
    { data: products },
    { data: techStackRaw },
    { data: dependencyItems },
  ] = await Promise.all([
    supabase
      .schema("metago")
      .from("products")
      .select("id, name, display_name, primary_color")
      .order("priority"),
    supabase
      .schema("metago")
      .from("tech_stack_items")
      .select("product_id, package_name, category, is_dev")
      .eq("is_dev", false)
      .order("category")
      .order("package_name"),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("*, products(display_name, primary_color)")
      .order("created_at", { ascending: false }),
  ]);

  const allProducts = products ?? [];
  const techStack = techStackRaw ?? [];
  const allItems = dependencyItems ?? [];

  // 共通スタック: 全プロダクトが持つパッケージ
  const productCount = allProducts.length;
  const pkgProductCount = new Map<string, number>();
  techStack.forEach((item) => {
    pkgProductCount.set(
      item.package_name,
      (pkgProductCount.get(item.package_name) ?? 0) + 1,
    );
  });

  // 共通パッケージ名セット
  const sharedPkgNames = new Set(
    productCount > 0
      ? [...pkgProductCount.entries()]
          .filter(([, count]) => count === productCount)
          .map(([name]) => name)
      : [],
  );

  // 共通スタックをカテゴリ別にまとめる（重複除去）
  const sharedByCategory = new Map<string, string[]>();
  const seenShared = new Set<string>();
  for (const item of techStack) {
    if (!sharedPkgNames.has(item.package_name)) continue;
    if (seenShared.has(item.package_name)) continue;
    seenShared.add(item.package_name);
    if (!sharedByCategory.has(item.category))
      sharedByCategory.set(item.category, []);
    sharedByCategory.get(item.category)!.push(item.package_name);
  }

  // プロダクトごとの固有スタック（共通を除く）
  const stackByProduct = new Map<string, Map<string, string[]>>();
  for (const item of techStack) {
    if (sharedPkgNames.has(item.package_name)) continue;
    if (!stackByProduct.has(item.product_id))
      stackByProduct.set(item.product_id, new Map());
    const catMap = stackByProduct.get(item.product_id)!;
    if (!catMap.has(item.category)) catMap.set(item.category, []);
    catMap.get(item.category)!.push(item.package_name);
  }

  const hasTechStack = techStack.length > 0;
  const majorCount = allItems.filter(
    (i) => i.update_type === "major" && i.state !== "done",
  ).length;
  const minorCount = allItems.filter(
    (i) => i.update_type === "minor" && i.state !== "done",
  ).length;

  return (
    <>
      <PageHeader
        title="依存・技術スタック"
        description="各プロダクトの技術スタックとパッケージ更新状況"
      />

      {/* ======================================================
          Section 1: 技術スタック
      ====================================================== */}
      <section>
        <h2
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          技術スタック
        </h2>

        {!hasTechStack ? (
          <EmptyState
            icon={<Layers className="size-12" />}
            title="技術スタックがまだ収集されていません"
            description="GitHub Actions の週次ワークフローが実行されるか、手動トリガーすると自動収集されます"
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* 共通スタック */}
            {sharedByCategory.size > 0 && (
              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <div
                  className="px-4 py-3 border-b border-border flex items-center gap-2"
                  style={{ backgroundColor: "var(--color-surface-subtle)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    共通スタック
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    全プロダクト共通 · {seenShared.size} packages
                  </span>
                </div>
                <div className="px-4 py-4 flex flex-col gap-3">
                  {CATEGORY_ORDER.filter((cat) =>
                    sharedByCategory.has(cat),
                  ).map((cat) => (
                    <CategorySection
                      key={cat}
                      category={cat}
                      items={sharedByCategory
                        .get(cat)!
                        .map((name) => ({ package_name: name }))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* プロダクト別固有スタック */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {allProducts.map((product) => {
                const catMap = stackByProduct.get(product.id);
                const hasUnique = catMap && catMap.size > 0;
                const uniqueCount = hasUnique
                  ? [...catMap!.values()].reduce((s, a) => s + a.length, 0)
                  : 0;

                return (
                  <div
                    key={product.id}
                    className="rounded-lg border border-border bg-surface overflow-hidden"
                  >
                    {/* カラーバー */}
                    <div
                      className="h-1"
                      style={{
                        backgroundColor: product.primary_color ?? "#6B7280",
                      }}
                    />

                    {/* カードヘッダー */}
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: product.primary_color ?? "#6B7280",
                        }}
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {product.display_name}
                      </span>
                      {hasUnique && (
                        <span
                          className="text-xs ml-auto"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          固有 {uniqueCount} packages
                        </span>
                      )}
                    </div>

                    {/* カテゴリ別パッケージ */}
                    <div className="px-4 py-4">
                      {hasUnique ? (
                        <div className="flex flex-col gap-3">
                          {CATEGORY_ORDER.filter((cat) => catMap!.has(cat)).map(
                            (cat) => (
                              <CategorySection
                                key={cat}
                                category={cat}
                                items={catMap!
                                  .get(cat)!
                                  .map((name) => ({ package_name: name }))}
                              />
                            ),
                          )}
                        </div>
                      ) : (
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          共通スタックのみ（固有パッケージなし）
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ======================================================
          Section 2: アップデート状況
      ====================================================== */}
      <section>
        <h2
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          アップデート状況
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-2xl font-semibold text-foreground">
              {allItems.length}
            </div>
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              確認済みパッケージ
            </div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <div className="text-2xl font-semibold text-red-600">{majorCount}</div>
            <div className="text-sm text-red-600">Major 更新あり</div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
            <div className="text-2xl font-semibold text-orange-600">
              {minorCount}
            </div>
            <div className="text-sm text-orange-600">Minor 更新あり</div>
          </div>
        </div>

        {allItems.length === 0 ? (
          <EmptyState
            icon={<Package className="size-12" />}
            title="データがまだありません"
            description="GitHub Actions cron が実行されるとデータが表示されます"
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  {[
                    "プロダクト",
                    "パッケージ",
                    "現バージョン",
                    "最新バージョン",
                    "種類",
                    "状態",
                    "PR",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-surface-subtle"
                  >
                    <td className="px-4 py-3 text-sm">
                      {(item.products as any)?.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-foreground">
                      {item.package_name}
                    </td>
                    <td
                      className="px-4 py-3 text-sm font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {item.current_version}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-green-600">
                      {item.latest_version}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                        style={{
                          backgroundColor:
                            UPDATE_TYPE_COLORS[item.update_type] ?? "#6B7280",
                        }}
                      >
                        {item.update_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={item.state === "done" ? "default" : "outline"}
                      >
                        {STATE_LABELS[item.state] ?? item.state}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.pr_url && (
                        <a
                          href={item.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink
                            className="size-4"
                            style={{ color: "var(--color-primary)" }}
                          />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
