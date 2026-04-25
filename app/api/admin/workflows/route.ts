/**
 * GET  /api/admin/workflows — 一覧取得
 * POST /api/admin/workflows — 新規追加
 *
 * RLS の is_takaki() でアクセス制御。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeNextRun,
  validateCronExpression,
} from "@/lib/metago/workflow-dispatcher";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .select("*")
    .order("category", { ascending: true })
    .order("workflow_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    workflow_name,
    workflow_file,
    display_name,
    description,
    category,
    cron_expression,
    cron_timezone,
    enabled,
  } = body as {
    workflow_name?: string;
    workflow_file?: string;
    display_name?: string;
    description?: string;
    category?: string;
    cron_expression?: string;
    cron_timezone?: string;
    enabled?: boolean;
  };

  if (
    !workflow_name ||
    !workflow_file ||
    !display_name ||
    !category ||
    !cron_expression
  ) {
    return NextResponse.json(
      {
        error:
          "workflow_name, workflow_file, display_name, category, cron_expression は必須",
      },
      { status: 400 },
    );
  }

  if (!["scan", "fix", "collect"].includes(category)) {
    return NextResponse.json(
      { error: "category は scan/fix/collect のいずれか" },
      { status: 400 },
    );
  }

  const cronCheck = validateCronExpression(cron_expression);
  if (!cronCheck.valid) {
    return NextResponse.json(
      { error: `invalid cron: ${cronCheck.error}` },
      { status: 400 },
    );
  }

  const tz = cron_timezone ?? "Asia/Tokyo";
  const nextRun = computeNextRun(cron_expression, tz);

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .insert({
      workflow_name,
      workflow_file,
      display_name,
      description: description ?? null,
      category,
      cron_expression,
      cron_timezone: tz,
      enabled: enabled ?? true,
      next_run_at: nextRun?.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}
