import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@takaki/go-design-system";
import {
  ExternalLink,
  Layers,
  Package,
  Anchor,
  Palette,
  Wrench,
  Boxes,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import {
  PACKAGE_DESCRIPTIONS,
  LAYER_CONFIG,
  LAYER_ORDER,
  type PackageLayer,
} from "@/lib/package-descriptions";

// ---------------------------------------------------------
// Layer presentation
// ---------------------------------------------------------
const LAYER_ICON: Record<PackageLayer, typeof Anchor> = {
  foundation: Anchor,
  "layer1-ds": Palette,
  "layer2-standard": Wrench,
  "layer3-feature": Boxes,
  "layer4-specific": Sparkles,
  forbidden: ShieldAlert,
};

const LAYER_SHORT: Record<PackageLayer, string> = {
  foundation: "Foundation",
  "layer1-ds": "Layer 1 — Design System",
  "layer2-standard": "Layer 2 — Standard",
  "layer3-feature": "Layer 3 — Feature",
  "layer4-specific": "Layer 4 — Product-specific",
  forbidden: "方針違反",
};

const UNCLASSIFIED_LAYER: PackageLayer = "layer4-specific";

function getLayer(name: string): PackageLayer {
  return PACKAGE_DESCRIPTIONS[name]?.layer ?? UNCLASSIFIED_LAYER;
}

function getDescription(name: string): string | undefined {
  return PACKAGE_DESCRIPTIONS[name]?.description;
}

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  in_progress: "対応中",
  done: "完了",
};

// Lozenge style update_type — Atlassian-flavored soft-fill pills
const UPDATE_TYPE_STYLE: Record<
  string,
  { label: string; bg: string; fg: string; border: string }
> = {
  patch: {
    label: "patch",
    bg: "#DCFCE7",
    fg: "#166534",
    border: "#BBF7D0",
  },
  minor: {
    label: "minor",
    bg: "#FEF3C7",
    fg: "#92400E",
    border: "#FDE68A",
  },
  major: {
    label: "major",
    bg: "#FEE2E2",
    fg: "#991B1B",
    border: "#FECACA",
  },
  framework: {
    label: "framework",
    bg: "#EDE9FE",
    fg: "#5B21B6",
    border: "#DDD6FE",
  },
};

// ---------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------

function PackageChip({ name }: { name: string }) {
  const display = name
    .replace("@takaki/", "")
    .replace("@supabase/", "supabase/")
    .replace("@ai-sdk/", "ai-sdk/")
    .replace("@anthropic-ai/", "anthropic/")
    .replace("@hookform/", "hookform/");

  const desc = getDescription(name);
  const layer = getLayer(name);
  const cfg = LAYER_CONFIG[layer];

  return (
    <span
      title={desc ? `${name}\n${desc}` : name}
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] leading-tight"
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        borderColor: cfg.border,
      }}
    >
      {display}
    </span>
  );
}

function LayerGroup({
  layer,
  packages,
}: {
  layer: PackageLayer;
  packages: string[];
}) {
  const cfg = LAYER_CONFIG[layer];
  const Icon = LAYER_ICON[layer];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex size-5 items-center justify-center rounded"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <Icon className="size-3" />
        </span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: cfg.color }}
        >
          {LAYER_SHORT[layer]}
        </span>
        <span className="text-[11px] text-muted-foreground">
          · {packages.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {packages.map((name) => (
          <PackageChip key={name} name={name} />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  accent: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">
          {value}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------
// Page
// ---------------------------------------------------------

export default async function DependencyPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: techStackRaw }, { data: dependencyItems }] =
    await Promise.all([
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

  // ── 共通パッケージ（全プロダクト共通）
  const productCount = allProducts.length;
  const pkgCount = new Map<string, number>();
  for (const item of techStack) {
    pkgCount.set(item.package_name, (pkgCount.get(item.package_name) ?? 0) + 1);
  }
  const sharedPkgs = new Set(
    productCount > 0
      ? [...pkgCount.entries()]
          .filter(([, c]) => c === productCount)
          .map(([n]) => n)
      : [],
  );

  // ── Layerごとに共通パッケージを分類
  const sharedByLayer = new Map<PackageLayer, string[]>();
  const seenShared = new Set<string>();
  for (const item of techStack) {
    if (!sharedPkgs.has(item.package_name)) continue;
    if (seenShared.has(item.package_name)) continue;
    seenShared.add(item.package_name);
    const layer = getLayer(item.package_name);
    if (!sharedByLayer.has(layer)) sharedByLayer.set(layer, []);
    sharedByLayer.get(layer)!.push(item.package_name);
  }
  for (const arr of sharedByLayer.values()) arr.sort();

  // ── プロダクトごとの固有パッケージ（共通除外）をLayerで分類
  const uniqueByProduct = new Map<string, Map<PackageLayer, string[]>>();
  for (const item of techStack) {
    if (sharedPkgs.has(item.package_name)) continue;
    if (!uniqueByProduct.has(item.product_id))
      uniqueByProduct.set(item.product_id, new Map());
    const layerMap = uniqueByProduct.get(item.product_id)!;
    const layer = getLayer(item.package_name);
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(item.package_name);
  }
  for (const layerMap of uniqueByProduct.values()) {
    for (const arr of layerMap.values()) arr.sort();
  }

  const hasTechStack = techStack.length > 0;
  const sharedTotal = seenShared.size;
  const uniqueTotal = [...uniqueByProduct.values()].reduce(
    (sum, m) => sum + [...m.values()].reduce((s, a) => s + a.length, 0),
    0,
  );
  const majorCount = allItems.filter(
    (i) => i.update_type === "major" && i.state !== "done",
  ).length;
  const minorCount = allItems.filter(
    (i) => i.update_type === "minor" && i.state !== "done",
  ).length;
  const pendingCount = allItems.filter((i) => i.state !== "done").length;

  return (
    <>
      <PageHeader
        title="依存・技術スタック"
        description="各プロダクトの技術スタックとパッケージ更新状況"
      />

      {/* ─── Stat row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="プロダクト"
          value={allProducts.length}
          sublabel="登録済み"
          accent="#1E3A8A"
        />
        <StatCard
          label="共通スタック"
          value={sharedTotal}
          sublabel="全プロダクト共通"
          accent="#059669"
        />
        <StatCard
          label="プロダクト固有"
          value={uniqueTotal}
          sublabel="合計（重複あり）"
          accent="#D97706"
        />
        <StatCard
          label="更新待ち"
          value={pendingCount}
          sublabel={`major ${majorCount} / minor ${minorCount}`}
          accent="#DC2626"
        />
      </div>

      {/* ─── Section 1: 技術スタック ─────────────────────── */}
      {!hasTechStack ? (
        <EmptyState
          icon={<Layers className="size-12" />}
          title="技術スタックがまだ収集されていません"
          description="GitHub Actions の週次ワークフローが実行されるか、手動トリガーすると自動収集されます"
        />
      ) : (
        <>
          {/* 共通スタック */}
          {sharedByLayer.size > 0 && (
            <Card>
              <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
                <div className="flex items-baseline gap-2">
                  <CardTitle className="text-sm">共通スタック</CardTitle>
                  <CardDescription className="text-xs">
                    全プロダクトが採用しているパッケージ
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono">
                  {sharedTotal} packages
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 p-5">
                {LAYER_ORDER.filter((l) => sharedByLayer.has(l)).map((l) => (
                  <LayerGroup
                    key={l}
                    layer={l}
                    packages={sharedByLayer.get(l)!}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* プロダクト別固有スタック */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                プロダクト固有スタック
              </h2>
              <span className="text-xs text-muted-foreground">
                共通スタックを除いた、各プロダクト独自のパッケージ
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {allProducts.map((product) => {
                const layerMap = uniqueByProduct.get(product.id);
                const hasUnique = layerMap && layerMap.size > 0;
                const uniqueCount = hasUnique
                  ? [...layerMap!.values()].reduce((s, a) => s + a.length, 0)
                  : 0;
                const accent = product.primary_color ?? "#6B7280";

                return (
                  <Card
                    key={product.id}
                    className="overflow-hidden"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <CardTitle className="text-sm">
                          {product.display_name}
                        </CardTitle>
                      </div>
                      {hasUnique ? (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          固有 {uniqueCount}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          共通のみ
                        </span>
                      )}
                    </CardHeader>
                    <CardContent className="p-4">
                      {hasUnique ? (
                        <div className="flex flex-col gap-4">
                          {LAYER_ORDER.filter((l) => layerMap!.has(l)).map(
                            (l) => (
                              <LayerGroup
                                key={l}
                                layer={l}
                                packages={layerMap!.get(l)!}
                              />
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          共通スタックのみで構成。固有のパッケージはありません。
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* ─── Section 2: アップデート状況 ─────────────────── */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">アップデート状況</CardTitle>
            <CardDescription className="text-xs">
              dependency_items に記録された更新候補
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {allItems.length} items
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {allItems.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Package className="size-12" />}
                title="データがまだありません"
                description="GitHub Actions cron が実行されるとデータが表示されます"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    プロダクト
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    パッケージ
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    現バージョン
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    最新
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    種類
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    状態
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    PR
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allItems.map((item) => {
                  const accent =
                    (item.products as { primary_color?: string } | null)
                      ?.primary_color ?? "#6B7280";
                  const updType = UPDATE_TYPE_STYLE[item.update_type];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          {(item.products as { display_name?: string } | null)
                            ?.display_name ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 font-mono text-sm font-medium text-foreground">
                        {item.package_name}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {item.current_version}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 font-mono text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {item.latest_version}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        {updType ? (
                          <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                            style={{
                              backgroundColor: updType.bg,
                              color: updType.fg,
                              borderColor: updType.border,
                            }}
                          >
                            {updType.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {item.update_type}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <Badge
                          variant={
                            item.state === "done" ? "default" : "outline"
                          }
                        >
                          {STATE_LABELS[item.state] ?? item.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        {item.pr_url && (
                          <a
                            href={item.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-primary hover:opacity-80"
                            title="PR を開く"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
