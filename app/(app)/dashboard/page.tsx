import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*")
    .order("priority");

  const { data: latestScores } = await supabase
    .schema("metago")
    .from("scores_history")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(500);

  const { data: pendingApprovals } = await supabase
    .schema("metago")
    .from("approval_queue")
    .select("*")
    .eq("state", "pending")
    .order("created_at", { ascending: false });

  return (
    <DashboardClient
      products={products ?? []}
      latestScores={latestScores ?? []}
      pendingApprovals={pendingApprovals ?? []}
    />
  );
}
