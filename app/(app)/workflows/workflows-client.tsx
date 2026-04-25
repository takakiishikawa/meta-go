"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Input,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@takaki/go-design-system";
import { Save, AlertCircle, Trash2, Plus } from "lucide-react";

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

interface FormState {
  workflow_name: string;
  workflow_file: string;
  display_name: string;
  description: string;
  category: "scan" | "fix" | "collect";
  cron_expression: string;
}

const EMPTY_FORM: FormState = {
  workflow_name: "",
  workflow_file: "",
  display_name: "",
  description: "",
  category: "scan",
  cron_expression: "0 18 * * *",
};

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
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

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

  async function handleDelete(schedule: Schedule) {
    if (
      !confirm(
        `「${schedule.display_name}」を削除しますか？\n（DBエントリのみ削除。 .yml ファイルは別途削除が必要）`,
      )
    )
      return;
    setBusyId(schedule.id);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/workflows/${schedule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "削除失敗");
      }
      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setBusyId(null);
  }

  async function handleAdd() {
    if (
      !form.workflow_name ||
      !form.workflow_file ||
      !form.display_name ||
      !form.cron_expression
    ) {
      setErrorMessage("workflow_name / workflow_file / display_name / cron_expression は必須");
      return;
    }
    setAdding(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "追加失敗");
      setSchedules((prev) => [...prev, data.schedule]);
      setForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setAdding(false);
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

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5 mr-1" />
          新規追加
        </Button>
      </div>

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
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => handleDelete(s)}
                      style={{ color: "var(--color-danger)" }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {schedules.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Workflowが登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="rounded-md border border-border p-4 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <strong>cron式の例 (UTC基準):</strong>
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
          実行は GitHub Actions 側で行われます。手動実行が必要な場合は GitHub
          Actions の Run workflow ボタンから実行してください。
        </p>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Workflow 新規追加</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>workflow_name</Label>
                <Input
                  value={form.workflow_name}
                  onChange={(e) =>
                    setForm({ ...form, workflow_name: e.target.value })
                  }
                  placeholder="my-new-scan"
                />
              </div>
              <div>
                <Label>workflow_file</Label>
                <Input
                  value={form.workflow_file}
                  onChange={(e) =>
                    setForm({ ...form, workflow_file: e.target.value })
                  }
                  placeholder="my-new-scan.yml"
                />
              </div>
            </div>
            <div>
              <Label>display_name</Label>
              <Input
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
                placeholder="UI表示名"
              />
            </div>
            <div>
              <Label>description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="何をするworkflowか"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v: any) =>
                    setForm({ ...form, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scan">調査 (scan)</SelectItem>
                    <SelectItem value="fix">実行 (fix)</SelectItem>
                    <SelectItem value="collect">API収集 (collect)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>cron_expression (UTC)</Label>
                <Input
                  value={form.cron_expression}
                  onChange={(e) =>
                    setForm({ ...form, cron_expression: e.target.value })
                  }
                  className="font-mono"
                  placeholder="0 18 * * *"
                />
              </div>
            </div>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              ※ workflow_file に対応する .yml は別途リポジトリに配置してください
            </p>
            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="ghost"
                onClick={() => setAddOpen(false)}
                disabled={adding}
              >
                キャンセル
              </Button>
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? "追加中..." : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
