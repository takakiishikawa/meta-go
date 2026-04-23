"use client";

import { PageHeader, EmptyState, Badge } from "@takaki/go-design-system";
import { Key, ExternalLink, RefreshCw } from "lucide-react";

interface ApiKey {
  id: string;
  env_var_name: string;
  name: string | null;
  provider: string | null;
  category: string | null;
  used_by: string[];
  notes: string | null;
  auto_detected: boolean;
  last_seen_at: string | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  display_name: string;
  primary_color: string;
}

const GOOGLE_PM_URL = "https://passwords.google.com";

// Auto-infer category from env var name
function inferCategory(envVar: string): string {
  const n = envVar.toUpperCase();
  if (
    /ANTHROPIC|OPENAI|GEMINI|CLAUDE|GPT|LLM|TOGETHER|REPLICATE|HUGGING|AI_/.test(
      n,
    )
  )
    return "AI / LLM";
  if (/SUPABASE|DATABASE_URL|POSTGRES|MYSQL|MONGO|REDIS|NEON/.test(n))
    return "データベース";
  if (/STRIPE|PAYMENT|PAYPAL|SQUARE/.test(n)) return "決済・Payment";
  if (/GOOGLE_CLIENT|GITHUB_CLIENT|AUTH|OAUTH|JWT|SESSION|NEXTAUTH/.test(n))
    return "認証・Auth";
  if (/VERCEL|GH_PAT|GITHUB_TOKEN|GITHUB_OWNER|CI_TOKEN/.test(n))
    return "インフラ";
  if (/SLACK|DISCORD|TWILIO|SENDGRID|EMAIL|SMTP|LINE_/.test(n))
    return "通知・Messaging";
  if (/S3_|STORAGE|CLOUDINARY|BLOB|CDN/.test(n)) return "ストレージ";
  if (/GA_|ANALYTICS|MIXPANEL|SEGMENT|AMPLITUDE/.test(n))
    return "分析・Analytics";
  return "その他";
}

// Auto-infer display name from env var name when name is null
function inferDisplayName(envVar: string): string | null {
  const n = envVar.toUpperCase();
  if (n.includes("ANTHROPIC")) return "Anthropic";
  if (n.includes("OPENAI")) return "OpenAI";
  if (n.includes("GEMINI")) return "Google Gemini";
  if (n.includes("SUPABASE")) return "Supabase";
  if (n.includes("STRIPE")) return "Stripe";
  if (n.includes("VERCEL")) return "Vercel";
  if (n.includes("GITHUB")) return "GitHub";
  if (n.includes("GOOGLE")) return "Google";
  if (n.includes("NEXTAUTH")) return "NextAuth.js";
  if (n.includes("SENDGRID")) return "SendGrid";
  if (n.includes("TWILIO")) return "Twilio";
  if (n.includes("SLACK")) return "Slack";
  if (n.includes("DISCORD")) return "Discord";
  if (n.includes("CLOUDINARY")) return "Cloudinary";
  if (n.includes("S3")) return "AWS S3";
  if (n.includes("REDIS")) return "Redis";
  if (n.includes("POSTGRES")) return "PostgreSQL";
  return null;
}

function ProductDots({
  slugs,
  products,
}: {
  slugs: string[];
  products: Product[];
}) {
  if (!slugs.length)
    return (
      <span
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-xs)",
        }}
      >
        —
      </span>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map((slug) => {
        const p = products.find((p) => p.name === slug);
        return (
          <span
            key={slug}
            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: (p?.primary_color ?? "#6B7280") + "22",
              color: p?.primary_color ?? "#6B7280",
            }}
          >
            <span
              className="size-1.5 rounded-full inline-block"
              style={{ backgroundColor: p?.primary_color ?? "#6B7280" }}
            />
            {p?.display_name ?? slug}
          </span>
        );
      })}
    </div>
  );
}

export function ApisClient({
  apiKeys,
  products,
}: {
  apiKeys: ApiKey[];
  products: Product[];
}) {
  const lastSeen = apiKeys
    .filter((k) => k.last_seen_at)
    .sort(
      (a, b) =>
        new Date(b.last_seen_at!).getTime() -
        new Date(a.last_seen_at!).getTime(),
    )[0]?.last_seen_at;

  // Group by resolved category
  const grouped: Record<string, ApiKey[]> = {};
  for (const key of apiKeys) {
    const cat = key.category || inferCategory(key.env_var_name);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(key);
  }

  const categoryOrder = [
    "AI / LLM",
    "データベース",
    "認証・Auth",
    "決済・Payment",
    "インフラ",
    "通知・Messaging",
    "ストレージ",
    "分析・Analytics",
    "その他",
  ];
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <>
      <PageHeader
        title="API管理"
        description="goシリーズで利用する環境変数・APIキー一覧（週1回自動スキャン）"
        actions={
          <div className="flex items-center gap-3">
            {lastSeen && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <RefreshCw className="size-3" />
                最終スキャン: {new Date(lastSeen).toLocaleDateString("ja-JP")}
              </span>
            )}
            <a
              href={GOOGLE_PM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-subtle transition-colors"
            >
              <Key className="size-3.5" />
              Google パスワードマネージャー
              <ExternalLink className="size-3" />
            </a>
          </div>
        }
      />

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={<Key className="size-12" />}
          title="APIキーがまだ検出されていません"
          description="週次ワークフローが実行されると各goリポジトリからAPIキー名が自動スキャンされます"
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sortedGroups.map(([category, keys]) => (
            <div key={category} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {category}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {keys.length}件
                </span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle">
                      {[
                        "環境変数名",
                        "サービス",
                        "利用プロダクト",
                        "メモ",
                        "最終検出",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-xs font-medium"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const displayName =
                        key.name || inferDisplayName(key.env_var_name);
                      const displayProvider = key.provider;
                      return (
                        <tr
                          key={key.id}
                          className="border-b border-border last:border-0 hover:bg-surface-subtle"
                        >
                          {/* 環境変数名 */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                                {key.env_var_name}
                              </code>
                              {key.auto_detected && (
                                <span
                                  className="rounded text-[10px] px-1 font-medium"
                                  style={{
                                    backgroundColor:
                                      "var(--color-surface-subtle)",
                                    color: "var(--color-text-secondary)",
                                  }}
                                >
                                  自動
                                </span>
                              )}
                            </div>
                          </td>

                          {/* サービス名 */}
                          <td className="px-4 py-3">
                            {displayName ? (
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {displayName}
                                </div>
                                {displayProvider && (
                                  <div
                                    className="text-xs"
                                    style={{
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    {displayProvider}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span
                                className="text-xs"
                                style={{ color: "var(--color-text-secondary)" }}
                              >
                                —
                              </span>
                            )}
                          </td>

                          {/* 利用プロダクト */}
                          <td className="px-4 py-3 max-w-[220px]">
                            <ProductDots
                              slugs={key.used_by}
                              products={products}
                            />
                          </td>

                          {/* メモ */}
                          <td className="px-4 py-3 max-w-[180px]">
                            <span
                              className="text-xs line-clamp-2"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {key.notes || "—"}
                            </span>
                          </td>

                          {/* 最終検出 */}
                          <td
                            className="px-4 py-3 text-xs whitespace-nowrap"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {key.last_seen_at
                              ? new Date(key.last_seen_at).toLocaleDateString(
                                  "ja-JP",
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
