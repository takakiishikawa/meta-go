"use client";

import { useState } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@takaki/go-design-system";
import { PACKAGE_DESCRIPTIONS } from "@/lib/package-descriptions";

export interface ProductSummary {
  id: string;
  name: string;
  display_name: string;
  primary_color: string | null;
}

export interface PackageRow {
  package_name: string;
  category: string;
  description?: string;
  // product_id → version
  versions: Record<string, string>;
}

interface Props {
  products: ProductSummary[];
  shared: PackageRow[]; // 全 product 共通
  partial: PackageRow[]; // 2..N-1 product
  perProduct: Record<string, PackageRow[]>; // 単一 product
}

function dominantVersion(versions: Record<string, string>): {
  display: string;
  varied: boolean;
} {
  const counts = new Map<string, number>();
  for (const v of Object.values(versions)) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return { display: "—", varied: false };
  let best = "";
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return { display: best, varied: counts.size > 1 };
}

function ProductDot({
  product,
  size = 12,
}: {
  product: ProductSummary;
  size?: number;
}) {
  const color = product.primary_color ?? "#6B7280";
  return (
    <span
      title={product.display_name}
      className="inline-block shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
      }}
    />
  );
}

function ProductBadges({
  productIds,
  productMap,
}: {
  productIds: string[];
  productMap: Record<string, ProductSummary>;
}) {
  const sorted = [...productIds]
    .map((id) => productMap[id])
    .filter((p): p is ProductSummary => p != null)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {sorted.map((p) => (
        <Badge
          key={p.id}
          variant="outline"
          className="gap-1 rounded-full bg-muted/40 font-normal"
        >
          <ProductDot product={p} size={8} />
          {p.display_name}
        </Badge>
      ))}
    </div>
  );
}

function PackageTable({
  rows,
  productMap,
  totalProducts,
  showProducts,
}: {
  rows: PackageRow[];
  productMap: Record<string, ProductSummary>;
  totalProducts: number;
  showProducts: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        該当するパッケージがありません。
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableHead className="px-4 text-xs uppercase tracking-wider">
            パッケージ
          </TableHead>
          <TableHead className="px-4 text-xs uppercase tracking-wider">
            カテゴリ
          </TableHead>
          <TableHead className="px-4 text-xs uppercase tracking-wider">
            バージョン
          </TableHead>
          <TableHead className="px-4 text-xs uppercase tracking-wider">
            {showProducts ? "使用go" : "数"}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const ver = dominantVersion(row.versions);
          const usingIds = Object.keys(row.versions);
          return (
            <TableRow key={row.package_name}>
              <TableCell className="px-4 py-2.5 align-top">
                <div className="font-mono text-sm font-medium text-foreground">
                  {row.package_name}
                </div>
                {row.description && (
                  <div className="mt-0.5 line-clamp-2 max-w-md text-xs text-muted-foreground">
                    {row.description}
                  </div>
                )}
              </TableCell>
              <TableCell className="px-4 py-2.5 align-top">
                <Badge variant="outline" className="text-xs">
                  {row.category}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-2.5 align-top">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-foreground">
                    {ver.display}
                  </span>
                  {ver.varied && (
                    <Badge
                      title={Object.entries(row.versions)
                        .map(
                          ([id, v]) =>
                            `${productMap[id]?.display_name ?? id}: ${v}`,
                        )
                        .join("\n")}
                      variant="outline"
                      className="rounded-full border-warning bg-warning-subtle text-warning"
                    >
                      混在
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-4 py-2.5 align-top">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">
                    {usingIds.length} / {totalProducts}
                  </span>
                  {showProducts && (
                    <ProductBadges
                      productIds={usingIds}
                      productMap={productMap}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function DependencyTables({
  products,
  shared,
  partial,
  perProduct,
}: Props) {
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const productsWithUnique = products.filter(
    (p) => (perProduct[p.id]?.length ?? 0) > 0,
  );
  const [activeTab, setActiveTab] = useState<string>(
    productsWithUnique[0]?.id ?? "",
  );

  return (
    <>
      {/* 共通スタック */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">共通スタック</CardTitle>
            <CardDescription className="text-xs">
              全 {products.length} プロダクトが採用
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {shared.length} packages
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <PackageTable
            rows={shared}
            productMap={productMap}
            totalProducts={products.length}
            showProducts={false}
          />
        </CardContent>
      </Card>

      {/* 部分共通 */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">部分共通</CardTitle>
            <CardDescription className="text-xs">
              2〜{products.length - 1} プロダクトで使用
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {partial.length} packages
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <PackageTable
            rows={partial}
            productMap={productMap}
            totalProducts={products.length}
            showProducts={true}
          />
        </CardContent>
      </Card>

      {/* 個別固有: タブ切り替え */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">個別固有</CardTitle>
            <CardDescription className="text-xs">
              単一プロダクトのみで使用
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {Object.values(perProduct).reduce((s, a) => s + a.length, 0)}{" "}
            packages
          </Badge>
        </CardHeader>

        {productsWithUnique.length === 0 ? (
          <CardContent className="p-6">
            <p className="text-center text-sm text-muted-foreground">
              個別固有のパッケージはありません。
            </p>
          </CardContent>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex-wrap gap-1 px-3 pt-2">
                {productsWithUnique.map((p) => {
                  const active = activeTab === p.id;
                  const count = perProduct[p.id]?.length ?? 0;
                  return (
                    <TabsTrigger
                      key={p.id}
                      value={p.id}
                      className="gap-1.5 px-3 pb-2 pt-1"
                    >
                      <ProductDot product={p} size={8} />
                      {p.display_name}
                      <span
                        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <CardContent className="p-0">
              {activeTab && (
                <PackageTable
                  rows={perProduct[activeTab] ?? []}
                  productMap={productMap}
                  totalProducts={products.length}
                  showProducts={false}
                />
              )}
            </CardContent>
          </>
        )}
      </Card>
    </>
  );
}

// helper to enrich rows with descriptions on the server
export function enrichDescription(name: string): string | undefined {
  return PACKAGE_DESCRIPTIONS[name]?.description;
}
