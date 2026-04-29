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
        title="承認"
        description={
          pendingCount > 0
            ? `${pendingCount} 件のPRがあなたの判断を待っています`
            : "MetaGoが自動実行できない、判断が必要な変更を集約します"
        }
      />
      <ApprovalClient items={(items ?? []) as any} />
    </>
  );
}
