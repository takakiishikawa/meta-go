import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardContent,
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
import { ExternalLink, Layers, Package } from "lucide-react";
import { PACKAGE_DESCRIPTIONS } from "@/lib/package-descriptions";
import {
  DependencyTables,
  type PackageRow,
  type ProductSummary,
} from "./dependency-tables";
import { isResolved } from "@/lib/metago/items";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  fixing: "修正中",
  in_progress: "対応中",
  fixed: "完了",
  failed: "失敗",
  done: "完了",
};

const UPDATE_TYPE_STYLE: Record<
  string,
  { label: string; bg: string; fg: string; border: string }
> = {
  patch: { label: "patch", bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
  minor: { label: "minor", bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
  major: { label: "major", bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
  framework: {
    label: "framework",
    bg: "#EDE9FE",
    fg: "#5B21B6",
    border: "#DDD6FE",
  },
};

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
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
      .select("product_id, package_name, version, category, is_dev")
      .eq("is_dev", false)
      .order("package_name"),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("*, products(display_name, primary_color)")
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  const allProducts: ProductSummary[] = products ?? [];
  const techStack = techStackRaw ?? [];
  const allItems = dependencyItems ?? [];

  // パッケージ毎に { product_id → version } を集約
  const packageInfo = new Map<
    string,
    {
      category: string;
      versions: Record<string, string>;
    }
  >();
  for (const item of techStack) {
    if (!packageInfo.has(item.package_name)) {
      packageInfo.set(item.package_name, {
        category: item.category,
        versions: {},
      });
    }
    const info = packageInfo.get(item.package_name)!;
    info.versions[item.product_id] = item.version ?? "—";
  }

  // アップデート状況テーブル / IssueTrendSection 用 issue リスト (未解決のみ)
  const openItems = allItems.filter((i) => !isResolved(i.state));

  const total = allProducts.length;
  const shared: PackageRow[] = [];
  const partial: PackageRow[] = [];
  const perProduct: Record<string, PackageRow[]> = {};
  for (const p of allProducts) perProduct[p.id] = [];

  for (const [name, info] of packageInfo) {
    const usingIds = Object.keys(info.versions);
    const row: PackageRow = {
      package_name: name,
      category: info.category,
      description: PACKAGE_DESCRIPTIONS[name]?.description,
      versions: info.versions,
    };
    if (usingIds.length === total && total > 0) {
      shared.push(row);
    } else if (usingIds.length === 1) {
      perProduct[usingIds[0]].push(row);
    } else {
      partial.push(row);
    }
  }

  const sortByName = (a: PackageRow, b: PackageRow) =>
    a.package_name.localeCompare(b.package_name);
  shared.sort(sortByName);
  partial.sort((a, b) => {
    // 多い順 → 名前
    const aN = Object.keys(a.versions).length;
    const bN = Object.keys(b.versions).length;
    if (aN !== bN) return bN - aN;
    return a.package_name.localeCompare(b.package_name);
  });
  for (const id of Object.keys(perProduct)) perProduct[id].sort(sortByName);

  const hasTechStack = techStack.length > 0;
  const totalUnique = Object.values(perProduct).reduce(
    (s, a) => s + a.length,
    0,
  );
  const majorCount = allItems.filter(
    (i) => i.update_type === "major" && !isResolved(i.state),
  ).length;
  const minorCount = allItems.filter(
    (i) => i.update_type === "minor" && !isResolved(i.state),
  ).length;
  const pendingCount = allItems.filter((i) => !isResolved(i.state)).length;

  return (
    <>
      <PageHeader
        title="依存パッケージ"
        description="各goの技術スタックとパッケージ更新状況"
      />

      <IssueTrendSection items={allItems} noun="更新" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="プロダクト数"
          value={total}
          sublabel="管理対象"
          accent="#1E3A8A"
        />
        <StatCard
          label="共通パッケージ"
          value={shared.length}
          sublabel="全goで使用"
          accent="#059669"
        />
        <StatCard
          label="一部共通 / 個別"
          value={`${partial.length} / ${totalUnique}`}
          sublabel="複数go利用 / 単独利用"
          accent="#D97706"
        />
        <StatCard
          label="更新待ち"
          value={pendingCount}
          sublabel={`major ${majorCount} / minor ${minorCount}`}
          accent="#DC2626"
        />
      </div>

      {!hasTechStack ? (
        <EmptyState
          icon={<Layers className="size-12" />}
          title="技術スタックがまだ収集されていません"
          description="週次の収集ワークフローが走ると自動で表示されます"
        />
      ) : (
        <DependencyTables
          products={allProducts}
          shared={shared}
          partial={partial}
          perProduct={perProduct}
        />
      )}

      {/* アップデート状況 (未解決のみ) */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">未解決の更新</CardTitle>
          </div>
          <Badge variant="outline" className="font-mono">
            {openItems.length} 件
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {openItems.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Package className="size-12" />}
                title="未解決の更新はありません"
                description="新しい更新が検出されると自動でここに追加されます"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    プロダクト
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    パッケージ
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    現バージョン
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    最新
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    種類
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    状態
                  </TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">
                    PR
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openItems.map((item) => {
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
                        <span className="text-success">
                          {item.latest_version}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        {updType ? (
                          <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
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
                            isResolved(item.state) ? "default" : "outline"
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
