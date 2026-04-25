"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Input,
  Switch,
} from "@takaki/go-design-system";
import { Play, Save, AlertCircle } from "lucide-react";

interface Schedule {
  id: string;
  workflow_name: string;
  workflow_file: string;
  display_name: string;
  description: string | null;
  category: "scan" | "fix" | "collect";
  cron_expression: string;
  cron_timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_url: string | null;
  next_run_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  scan: "調査",
  fix: "実行",
  collect: "API収集",
};

const CATEGORY_COLORS: Record<string, string> = {
  scan: "var(--color-info)",
  fix: "var(--color-success)",
  collect: "var(--color-warning)",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function WorkflowsClient({
  initialSchedules,
}: {
  initialSchedules: Schedule[];
}) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSaveCron(schedule: Schedule) {
    const newCron = editing[schedule.id] ?? schedule.cron_expression;
    if (newCron === schedule.cron_expression) return;

    setBusyId(schedule.id);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/workflows/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cron_expression: newCron }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失敗");
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? data.schedule : s)),
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[schedule.id];
        return next;
      });
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setBusyId(null);
  }

  async function handleToggleEnabled(schedule: Schedule, enabled: boolean) {
    setBusyId(schedule.id);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/workflows/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失敗");
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? data.schedule : s)),
      );
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setBusyId(null);
  }

  async function handleRunNow(schedule: Schedule) {
    if (!confirm(`「${schedule.display_name}」を即時実行しますか？`)) return;

    setBusyId(schedule.id);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/admin/workflows/${schedule.id}/run-now`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "実行失敗");
      router.refresh();
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {errorMessage && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive p-3 text-sm"
          style={{ color: "var(--color-danger)" }}
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              {[
                "Workflow",
                "種別",
                "Cron",
                "有効",
                "最終実行",
                "次回予定",
                "操作",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const cronValue = editing[s.id] ?? s.cron_expression;
              const dirty = cronValue !== s.cron_expression;
              const isBusy = busyId === s.id;

              return (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {s.display_name}
                      </span>
                      {s.description && (
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {s.description}
                        </span>
                      )}
                      <span
                        className="text-xs mt-0.5"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {s.workflow_file}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: CATEGORY_COLORS[s.category],
                        color: CATEGORY_COLORS[s.category],
                      }}
                    >
                      {CATEGORY_LABELS[s.category]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={cronValue}
                        onChange={(e) =>
                          setEditing((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                        className="font-mono text-xs w-32"
                        placeholder="0 18 * * *"
                      />
                      {dirty && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => handleSaveCron(s)}
                        >
                          <Save className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => handleToggleEnabled(s, v)}
                      disabled={isBusy}
                    />
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <div className="flex flex-col">
                      <span>{formatDateTime(s.last_run_at)}</span>
                      {s.last_run_status && (
                        <span
                          style={{
                            color:
                              s.last_run_status === "failed"
                                ? "var(--color-danger)"
                                : s.last_run_status === "running"
                                  ? "var(--color-info)"
                                  : "var(--color-text-subtle)",
                          }}
                        >
                          {s.last_run_status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {formatDateTime(s.next_run_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => handleRunNow(s)}
                    >
                      <Play className="size-3.5 mr-1" />
                      今すぐ実行
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="rounded-md border border-border p-4 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <strong>cron式の例:</strong>
        <ul className="mt-1 ml-4 list-disc">
          <li>
            <code>0 18 * * *</code> — 毎日 UTC 18:00 (JST 03:00)
          </li>
          <li>
            <code>0 */4 * * *</code> — 4時間おき
          </li>
          <li>
            <code>0 19 * * 1</code> — 毎週月曜 UTC 19:00 (JST 04:00)
          </li>
          <li>
            <code>*/15 * * * *</code> — 15分おき
          </li>
        </ul>
        <p className="mt-2">
          すべてUTC基準。timezone は workflow_schedules.cron_timezone (デフォルト
          Asia/Tokyo) を使って次回時刻が計算される。
        </p>
      </div>
    </div>
  );
}
