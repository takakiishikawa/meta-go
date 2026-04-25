import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@takaki/go-design-system";
import { WorkflowsClient } from "./workflows-client";

export default async function WorkflowsPage() {
  const supabase = await createClient();
  const { data: schedules } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .select("*")
    .order("category", { ascending: true })
    .order("workflow_name", { ascending: true });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="GitHub Actions の cron スケジュール管理。DB が source of truth で、Vercel Cron が15分おきに dispatcher を起動して due な workflow を実行する。"
      />
      <WorkflowsClient initialSchedules={schedules ?? []} />
    </>
  );
}
