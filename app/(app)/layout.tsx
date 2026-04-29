import { redirect } from "next/navigation";
import { AppLayout } from "@takaki/go-design-system";
import {
  MetaGoSidebar,
  type SidebarScores,
} from "@/components/layout/metago-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 全 go の最新カテゴリスコアの平均を計算してサイドバーに渡す
  const { data: scoresHistory } = await supabase
    .schema("metago")
    .from("scores_history")
    .select("product_id, category, score, collected_at")
    .order("collected_at", { ascending: false })
    .limit(2000);

  const latestPerProductCategory = new Map<string, number>();
  for (const row of scoresHistory ?? []) {
    const k = `${row.product_id}|${row.category}`;
    if (!latestPerProductCategory.has(k)) {
      latestPerProductCategory.set(k, row.score);
    }
  }

  const sums: Record<string, { sum: number; count: number }> = {};
  for (const [key, score] of latestPerProductCategory) {
    const category = key.split("|")[1];
    if (!sums[category]) sums[category] = { sum: 0, count: 0 };
    sums[category].sum += score;
    sums[category].count++;
  }

  const avg = (cat: string): number | null => {
    const s = sums[cat];
    if (!s || s.count === 0) return null;
    return Math.round(s.sum / s.count);
  };

  const scores: SidebarScores = {
    quality: avg("quality"),
    security: avg("security"),
    design_system: avg("design_system"),
    performance: avg("performance"),
  };

  return (
    <AppLayout
      sidebar={<MetaGoSidebar scores={scores} />}
      mainClassName="flex flex-col gap-6 p-6"
    >
      {children}
    </AppLayout>
  );
}
