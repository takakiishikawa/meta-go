import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@takaki/go-design-system";
import { ApprovalClient } from "./approval-client";

export default async function ApprovalPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .schema("metago")
    .from("approval_queue")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false });

  const pendingCount = (items ?? []).filter(
    (i) => i.state === "pending",
  ).length;

  return (
    <>
      <PageHeader
        title="承認待ち"
        description={
          pendingCount > 0
            ? `${pendingCount}件の承認が必要なPRがあります`
            : "人間の判断が必要なアイテム一覧"
        }
      />
      <ApprovalClient items={(items ?? []) as any} />
    </>
  );
}
