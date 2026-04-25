import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScrollText } from "lucide-react";
import { ExecLogTable } from "@/components/exec-log/exec-log-table";

export default async function ExecLogPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .schema("metago")
    .from("execution_logs")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })
    .limit(100);

  const allLogs = logs ?? [];

  return (
    <>
      <PageHeader title="実行ログ" description="MetaGoの自動実行履歴" />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-semibold text-foreground">
            {allLogs.length}
          </div>
          <div className="text-sm text-muted-foreground">総実行件数</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <div className="text-2xl font-semibold text-green-600">
            {allLogs.filter((l) => l.state === "merged").length}
          </div>
          <div className="text-sm text-green-600">成功</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="text-2xl font-semibold text-red-600">
            {allLogs.filter((l) => l.state === "failed").length}
          </div>
          <div className="text-sm text-red-600">失敗</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="text-2xl font-semibold text-amber-600">
            {allLogs.filter((l) => l.state === "pending").length}
          </div>
          <div className="text-sm text-amber-600">承認待ち</div>
        </div>
      </div>

      {allLogs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-12" />}
          title="データがまだありません"
          description="MetaGoのワークフローが実行されるとログが表示されます"
        />
      ) : (
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">
            最近の実行履歴
          </h2>
          <ExecLogTable logs={allLogs} />
        </div>
      )}
    </>
  );
}
