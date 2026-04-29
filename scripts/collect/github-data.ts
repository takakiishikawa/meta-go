/**
 * GitHub APIから各goのデータを収集し、metagoスキーマにUPSERTする
 *
 * 収集内容:
 * - Dependabotアラート（security_items）
 * - package.json全依存のカテゴリ分類（tech_stack_items）
 * - package.json主要パッケージのバージョン差分（dependency_items）
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";

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

async function githubFetch(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    console.warn(`GitHub API ${path} returned ${res.status}`);
    return null;
  }
  return res.json();
}

async function getProducts() {
  const { data } = await supabase.schema("metago").from("products").select("*");
  return data ?? [];
}

function categorizePackage(name: string): string {
  if (["next", "react", "react-dom", "react-native"].includes(name)) {
    return "フレームワーク";
  }
  if (
    name.includes("tailwind") ||
    name.startsWith("@radix-ui/") ||
    name === "@takaki/go-design-system" ||
    name === "lucide-react" ||
    name === "framer-motion" ||
    name === "clsx" ||
    name === "class-variance-authority" ||
    name === "tailwind-merge" ||
    name === "cmdk" ||
    name === "vaul" ||
    name.includes("embla") ||
    name === "recharts" ||
    name.startsWith("@nivo/") ||
    name.includes("chart") ||
    name === "sonner" ||
    name === "react-hot-toast" ||
    name === "react-day-picker" ||
    name.startsWith("@headlessui/")
  ) {
    return "UI / デザイン";
  }
  if (
    name.startsWith("@supabase/") ||
    name === "drizzle-orm" ||
    name.startsWith("@planetscale/") ||
    name === "@vercel/postgres" ||
    name === "mongoose" ||
    name === "prisma" ||
    name.startsWith("@prisma/")
  ) {
    return "バックエンド / DB";
  }
  if (
    name.startsWith("@anthropic-ai/") ||
    name === "openai" ||
    name.startsWith("@ai-sdk/") ||
    name === "ai" ||
    name.startsWith("langchain") ||
    name.startsWith("@langchain/")
  ) {
    return "AI / ML";
  }
  if (name.includes("stripe") || name === "@lemonsqueezy/lemonsqueezy-js") {
    return "決済";
  }
  if (
    name === "zod" ||
    name === "react-hook-form" ||
    name.startsWith("@hookform/") ||
    name === "yup" ||
    name === "valibot"
  ) {
    return "フォーム / バリデーション";
  }
  if (
    name.startsWith("@types/") ||
    name === "typescript" ||
    name === "eslint" ||
    name.startsWith("eslint-") ||
    name.startsWith("@eslint/") ||
    name.startsWith("@typescript-eslint/") ||
    name === "prettier" ||
    name === "postcss" ||
    name === "autoprefixer" ||
    name === "tsx" ||
    name === "dotenv" ||
    name === "cross-env" ||
    name === "jest" ||
    name === "vitest" ||
    name.startsWith("@testing-library/")
  ) {
    return "開発ツール";
  }
  if (
    [
      "date-fns",
      "dayjs",
      "lodash",
      "lodash-es",
      "uuid",
      "nanoid",
      "axios",
      "qs",
    ].includes(name) ||
    name.startsWith("@tanstack/")
  ) {
    return "ユーティリティ";
  }
  return "その他";
}

async function fetchPackageJson(repo: string): Promise<any | null> {
  const content = await githubFetch(
    `/repos/${GITHUB_OWNER}/${repo}/contents/package.json`,
  );
  if (!content?.content) return null;
  try {
    return JSON.parse(Buffer.from(content.content, "base64").toString("utf-8"));
  } catch {
    console.warn(`Failed to parse package.json for ${repo}`);
    return null;
  }
}

async function collectDependabotAlerts(product: any, repo: string) {
  // open: 現在生きているアラート → state='new' で UPSERT
  const openAlerts = await githubFetch(
    `/repos/${GITHUB_OWNER}/${repo}/dependabot/alerts?state=open&per_page=100`,
  );
  if (Array.isArray(openAlerts)) {
    for (const alert of openAlerts) {
      const advisory = alert.security_advisory;
      const severity = advisory.severity?.toLowerCase() ?? "medium";
      const title = advisory.summary ?? `Dependabot Alert #${alert.number}`;
      // unique index: uniq_security_items_key (product_id, severity, title)
      const { error } = await supabase
        .schema("metago")
        .from("security_items")
        .upsert(
          {
            product_id: product.id,
            severity,
            title,
            cve: advisory.cve_id ?? null,
            description: advisory.description?.substring(0, 500) ?? null,
            state: "new",
            last_seen_at: new Date().toISOString(),
          },
          {
            onConflict: "product_id,severity,title",
            ignoreDuplicates: false,
          },
        );
      if (error) console.error("security_items upsert error:", error);
    }
  }

  // fixed/dismissed: GitHub側で解決されたアラート → DB行を fixed に揃える
  // (open フィルタからは消えるだけなので、ここで明示的に取得して解決遷移させる)
  const resolvedAlerts = await githubFetch(
    `/repos/${GITHUB_OWNER}/${repo}/dependabot/alerts?state=fixed&per_page=100`,
  );
  let resolvedCount = 0;
  if (Array.isArray(resolvedAlerts)) {
    for (const alert of resolvedAlerts) {
      const advisory = alert.security_advisory;
      const severity = advisory.severity?.toLowerCase() ?? "medium";
      const title = advisory.summary ?? `Dependabot Alert #${alert.number}`;
      const fixedAt =
        alert.fixed_at ?? alert.dismissed_at ?? new Date().toISOString();
      // 既存行があれば fixed に遷移、無ければ最初から fixed として記録。
      const { data, error } = await supabase
        .schema("metago")
        .from("security_items")
        .upsert(
          {
            product_id: product.id,
            severity,
            title,
            cve: advisory.cve_id ?? null,
            description: advisory.description?.substring(0, 500) ?? null,
            state: "fixed",
            resolved_at: fixedAt,
            last_seen_at: new Date().toISOString(),
          },
          {
            onConflict: "product_id,severity,title",
            ignoreDuplicates: false,
          },
        )
        .select("id");
      if (error) {
        console.error("security_items resolved upsert error:", error);
      } else if (data && data.length > 0) {
        resolvedCount++;
      }
    }
  }

  const openCount = Array.isArray(openAlerts) ? openAlerts.length : 0;
  console.log(
    `✓ ${product.name}: ${openCount} open + ${resolvedCount} resolved Dependabot alerts`,
  );
}

async function collectTechStack(product: any, pkg: any) {
  const deps = Object.entries(pkg.dependencies ?? {}).map(([name, ver]) => ({
    name,
    ver: String(ver),
    isDev: false,
  }));
  const devDeps = Object.entries(pkg.devDependencies ?? {}).map(
    ([name, ver]) => ({
      name,
      ver: String(ver),
      isDev: true,
    }),
  );
  // go-design-system のようなライブラリは peerDependencies に runtime deps を
  // 置く慣習なので、それも runtime 扱い (is_dev=false) で取り込む。
  // 他リポは通常 peerDeps を持たないので影響なし。
  const peerDeps = Object.entries(pkg.peerDependencies ?? {}).map(
    ([name, ver]) => ({
      name,
      ver: String(ver),
      isDev: false,
    }),
  );

  // 同名が複数経路で来た場合は dependencies > peer > dev の優先で1件に丸める
  const merged = new Map<
    string,
    { name: string; ver: string; isDev: boolean }
  >();
  for (const e of [...devDeps, ...peerDeps, ...deps]) {
    merged.set(e.name, e);
  }

  const items = [...merged.values()].map(({ name, ver, isDev }) => ({
    product_id: product.id,
    package_name: name,
    version: ver.replace(/^[\^~>=<]+/, ""),
    category: categorizePackage(name),
    is_dev: isDev,
    collected_at: new Date().toISOString(),
  }));

  // package.json から削除されたパッケージを DB に残し続けないため、
  // 当該プロダクトの古い行を全削除してから今回分を insert する。
  const { error: delError } = await supabase
    .schema("metago")
    .from("tech_stack_items")
    .delete()
    .eq("product_id", product.id);

  if (delError) {
    console.error(
      `tech_stack_items cleanup error for ${product.name}:`,
      delError,
    );
    return;
  }

  if (!items.length) {
    console.log(`✓ ${product.name}: 0 packages (cleared)`);
    return;
  }

  const { error } = await supabase
    .schema("metago")
    .from("tech_stack_items")
    .insert(items);

  if (error)
    console.error(`tech_stack_items insert error for ${product.name}:`, error);
  else
    console.log(
      `✓ ${product.name}: ${items.length} packages collected to tech_stack`,
    );
}

async function collectDependencyUpdates(product: any, pkg: any) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  const importantPackages = Object.entries(allDeps).filter(([name]) =>
    [
      "next",
      "react",
      "react-dom",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "typescript",
    ].includes(name),
  );

  for (const [packageName, currentVersion] of importantPackages) {
    const ver = String(currentVersion).replace(/[\^~>=<]/, "");
    try {
      const npmData = await fetch(
        `https://registry.npmjs.org/${packageName}/latest`,
      ).then((r) => r.json());
      const latestVersion = npmData.version;
      if (!latestVersion || latestVersion === ver) continue;

      const [curMajor, curMinor] = ver.split(".").map(Number);
      const [latMajor, latMinor] = latestVersion.split(".").map(Number);
      const updateType =
        latMajor > curMajor ? "major" : latMinor > curMinor ? "minor" : "patch";

      const { error } = await supabase
        .schema("metago")
        .from("dependency_items")
        .upsert(
          {
            product_id: product.id,
            package_name: packageName,
            current_version: ver,
            latest_version: latestVersion,
            update_type: updateType,
            state: "new",
          },
          { onConflict: "product_id,package_name", ignoreDuplicates: false },
        );
      if (error) {
        console.error(
          `dependency_items upsert error for ${packageName}:`,
          error.message,
        );
      }
    } catch (e) {
      console.warn(`Failed to check ${packageName}:`, e);
    }
  }
  console.log(`✓ ${product.name}: dependency updates checked`);
}

async function main() {
  console.log("🚀 Starting GitHub data collection...");
  const products = await getProducts();

  for (const product of products) {
    const repo = GO_REPOS[product.name];
    if (!repo) {
      console.warn(`No repo mapping for ${product.name}`);
      continue;
    }
    console.log(
      `\n📦 Processing ${product.display_name} (${GITHUB_OWNER}/${repo})`,
    );

    await collectDependabotAlerts(product, repo);

    const pkg = await fetchPackageJson(repo);
    if (pkg) {
      await collectTechStack(product, pkg);
      await collectDependencyUpdates(product, pkg);
    }
  }

  console.log("\n✅ GitHub data collection complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
