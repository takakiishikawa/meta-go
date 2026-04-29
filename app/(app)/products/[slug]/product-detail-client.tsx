"use client";

import { useState } from "react";
import {
  Badge,
  Card,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { isResolved } from "@/lib/metago/items";

interface ProductDetailClientProps {
  product: any;
  qualityItems: any[];
  securityItems: any[];
  dependencyItems: any[];
  designSystemItems: any[];
  performanceMetrics: any[];
  psfScores: any[];
  hypotheses: any[];
  backlog: any[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF5630",
  high: "#FF8B00",
  medium: "#FF991F",
  low: "#36B37E",
};

export function ProductDetailClient({
  product,
  qualityItems,
  securityItems,
  dependencyItems,
  designSystemItems,
  performanceMetrics,
  psfScores,
  hypotheses,
  backlog,
}: ProductDetailClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const color = product.primary_color || "#6B7280";

  const latestPerf = performanceMetrics[0];
  const latestPsf = psfScores[0];

  const psfChartData = [...psfScores].reverse().map((s) => ({
    date: s.collected_at.substring(0, 10),
    PSF: Math.round(s.psf_score),
    結果: Math.round(s.result_score),
    行動: Math.round(s.behavior_score),
  }));

  return (
    <>
      <PageHeader
        title={product.display_name}
        description={product.description}
        actions={
          product.vercel_url ? (
            <a
              href={product.vercel_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink
                className="size-5"
                style={{ color: "var(--color-primary)" }}
              />
            </a>
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="psf">PSF詳細</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="hypothesis">仮説・バックログ</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="コード品質" value={null} color={color} />
            <StatCard label="セキュリティ" value={null} color={color} />
            <StatCard label="デザインシステム" value={null} color={color} />
            <StatCard
              label="パフォーマンス"
              value={latestPerf?.score ?? null}
              color={color}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <InfoCard
              label="GitHubリポジトリ"
              value={product.github_repo}
              link={`https://github.com/${product.github_repo}`}
            />
            <InfoCard
              label="Vercel URL"
              value={product.vercel_url}
              link={product.vercel_url}
            />
            <InfoCard label="Priority" value={`P${product.priority}`} />
          </div>
        </TabsContent>

        {/* PSF Tab */}
        <TabsContent value="psf" className="mt-4">
          {psfScores.length === 0 ? (
            <EmptyState message="PSFデータがありません" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <ScoreDonut
                  score={latestPsf ? Math.round(latestPsf.psf_score) : null}
                  size={80}
                  color={color}
                />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      結果指標
                    </span>
                    <span className="font-semibold text-foreground">
                      {latestPsf ? Math.round(latestPsf.result_score) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      行動指標
                    </span>
                    <span className="font-semibold text-foreground">
                      {latestPsf ? Math.round(latestPsf.behavior_score) : "—"}
                    </span>
                  </div>
                </div>
              </div>
              {psfChartData.length > 1 && (
                <Card className="p-4">
                  <h3
                    className="mb-3 font-medium text-foreground"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    PSF推移
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={psfChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                      />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="PSF"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="結果"
                        stroke="#36B37E"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                      />
                      <Line
                        type="monotone"
                        dataKey="行動"
                        stroke="#FF991F"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Delivery Tab */}
        <TabsContent value="delivery" className="mt-4">
          <div className="flex flex-col gap-4">
            <Section
              title={`コード品質 (${qualityItems.filter((i) => i.state === "new").length}件未対応)`}
            >
              <ItemTable
                items={qualityItems}
                columns={["category", "title", "level", "state"]}
              />
            </Section>
            <Section
              title={`セキュリティ (${securityItems.filter((i) => !isResolved(i.state)).length}件未対応)`}
            >
              <SecurityTable items={securityItems} />
            </Section>
            <Section
              title={`依存関係 (${dependencyItems.filter((i) => !isResolved(i.state)).length}件未対応)`}
            >
              <DepTable items={dependencyItems} />
            </Section>
          </div>
        </TabsContent>

        {/* Hypothesis Tab */}
        <TabsContent value="hypothesis" className="mt-4">
          <div className="flex flex-col gap-4">
            <Section title="課題仮説">
              <HypoTable
                items={hypotheses.filter((h) => h.type === "problem")}
              />
            </Section>
            <Section title="解決策仮説">
              <HypoTable
                items={hypotheses.filter((h) => h.type === "solution")}
              />
            </Section>
            <Section title="バックログ">
              <BacklogTable items={backlog} />
            </Section>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <Card className="p-4 flex flex-col items-center gap-2">
      <ScoreDonut score={value} size={56} color={color} />
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--color-text-secondary)",
        }}
      >
        {label}
      </span>
    </Card>
  );
}

function InfoCard({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: string;
}) {
  return (
    <Card className="p-3">
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--color-text-secondary)",
        }}
        className="mb-1"
      >
        {label}
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium"
          style={{ color: "var(--color-primary)" }}
        >
          {value}
        </a>
      ) : (
        <div className="text-sm font-medium text-foreground">{value}</div>
      )}
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        className="mb-2 font-semibold text-foreground"
        style={{ fontSize: "var(--text-sm)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-border">
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-secondary)",
        }}
      >
        {message}
      </p>
    </div>
  );
}

function ItemTable({ items, columns }: { items: any[]; columns: string[] }) {
  if (items.length === 0) return <EmptyState message="データなし" />;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 hover:bg-surface-subtle"
            >
              <td className="px-4 py-2 text-sm text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline">{item.category}</Badge>
              </td>
              <td className="px-4 py-2">
                <Badge variant={isResolved(item.state) ? "default" : "outline"}>
                  {item.state}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecurityTable({ items }: { items: any[] }) {
  if (items.length === 0) return <EmptyState message="データなし" />;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 hover:bg-surface-subtle"
            >
              <td className="px-4 py-2 text-sm text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-2">
                <Badge
                  className="text-white"
                  style={{
                    backgroundColor:
                      SEVERITY_COLORS[item.severity] ?? "#6B7280",
                  }}
                >
                  {item.severity}
                </Badge>
              </td>
              <td className="px-4 py-2">
                <Badge variant={isResolved(item.state) ? "default" : "outline"}>
                  {item.state}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DepTable({ items }: { items: any[] }) {
  if (items.length === 0) return <EmptyState message="データなし" />;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 hover:bg-surface-subtle"
            >
              <td className="px-4 py-2 text-sm font-mono text-foreground">
                {item.package_name}
              </td>
              <td
                className="px-4 py-2 text-sm font-mono"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {item.current_version} → {item.latest_version}
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline">{item.update_type}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HypoTable({ items }: { items: any[] }) {
  if (items.length === 0) return <EmptyState message="データなし" />;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 hover:bg-surface-subtle"
            >
              <td className="px-4 py-2 text-sm text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline">{item.state}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BacklogTable({ items }: { items: any[] }) {
  if (items.length === 0) return <EmptyState message="データなし" />;
  const PRIORITY_COLORS: Record<string, string> = {
    High: "#FF5630",
    Med: "#FF991F",
    Low: "#36B37E",
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 hover:bg-surface-subtle"
            >
              <td className="px-4 py-2 text-sm text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-2">
                <Badge
                  className="text-white"
                  style={{
                    backgroundColor:
                      PRIORITY_COLORS[item.priority] ?? "#6B7280",
                  }}
                >
                  {item.priority}
                </Badge>
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline">{item.state}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
