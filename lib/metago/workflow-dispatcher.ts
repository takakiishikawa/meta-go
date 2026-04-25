/**
 * Workflow Dispatcher
 *
 * metago.workflow_schedules テーブルから定義を読み、
 * - cron式から「次回実行予定」を計算
 * - 「dueになったworkflow」を GitHub workflow_dispatch で起動
 */

import { CronExpressionParser } from "cron-parser";
import { SupabaseClient } from "@supabase/supabase-js";

const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";
const GITHUB_REPO = "meta-go"; // workflowはmeta-goのみ

export interface WorkflowSchedule {
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

/**
 * cron式から次回実行時刻を計算
 */
export function computeNextRun(
  cronExpression: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: from,
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (e) {
    console.warn(`invalid cron expression: ${cronExpression}`, e);
    return null;
  }
}

/**
 * GitHub workflow_dispatch を呼ぶ
 * 戻り値: 成功時にruns検索用のdispatched_at（GitHub APIはrun IDを直接返さない）
 */
export async function dispatchWorkflow(
  workflowFile: string,
  inputs: Record<string, string> = {},
  ref = "main",
): Promise<{ ok: boolean; status: number; error?: string; dispatchedAt: string }> {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 0,
      error: "GH_PAT not set",
      dispatchedAt: new Date().toISOString(),
    };
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`;
  const dispatchedAt = new Date().toISOString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: body, dispatchedAt };
  }
  return { ok: true, status: res.status, dispatchedAt };
}

/**
 * dueになっているworkflowを全部実行
 * 戻り値: 実行したworkflowの一覧
 */
export async function dispatchDueWorkflows(
  supabase: SupabaseClient,
): Promise<{ dispatched: string[]; skipped: string[]; errors: string[] }> {
  const dispatched: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const { data: schedules, error } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .select("*")
    .eq("enabled", true);

  if (error) {
    errors.push(`fetch failed: ${error.message}`);
    return { dispatched, skipped, errors };
  }

  const now = new Date();

  for (const sched of (schedules ?? []) as WorkflowSchedule[]) {
    const nextRun = sched.next_run_at ? new Date(sched.next_run_at) : null;

    // next_run_at が未計算 or 過去 → 実行対象
    if (nextRun && nextRun > now) {
      skipped.push(sched.workflow_name);
      continue;
    }

    const dispatch = await dispatchWorkflow(sched.workflow_file);

    if (dispatch.ok) {
      // 次回実行時刻を再計算して記録
      const nextNext = computeNextRun(
        sched.cron_expression,
        sched.cron_timezone,
        now,
      );
      await supabase
        .schema("metago")
        .from("workflow_schedules")
        .update({
          last_run_at: dispatch.dispatchedAt,
          last_run_status: "running",
          next_run_at: nextNext?.toISOString() ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sched.id);
      dispatched.push(sched.workflow_name);
    } else {
      await supabase
        .schema("metago")
        .from("workflow_schedules")
        .update({
          last_run_at: dispatch.dispatchedAt,
          last_run_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sched.id);
      errors.push(`${sched.workflow_name}: ${dispatch.status} ${dispatch.error}`);
    }
  }

  return { dispatched, skipped, errors };
}

/**
 * cron式の妥当性チェック（UI入力検証用）
 */
export function validateCronExpression(expr: string): {
  valid: boolean;
  error?: string;
  description?: string;
} {
  try {
    const interval = CronExpressionParser.parse(expr);
    const next = interval.next().toDate();
    return {
      valid: true,
      description: `次回実行: ${next.toISOString()}`,
    };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
