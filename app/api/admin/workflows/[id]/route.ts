/**
 * PATCH /api/admin/workflows/[id]
 * - cron_expression / enabled の更新
 * - cron_expression が変更された場合、next_run_at を再計算
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeNextRun,
  validateCronExpression,
} from "@/lib/metago/workflow-dispatcher";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { cron_expression, enabled, cron_timezone } = body as {
    cron_expression?: string;
    enabled?: boolean;
    cron_timezone?: string;
  };

  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (cron_expression !== undefined) {
    const v = validateCronExpression(cron_expression);
    if (!v.valid) {
      return NextResponse.json(
        { error: `invalid cron: ${v.error}` },
        { status: 400 },
      );
    }
    updates.cron_expression = cron_expression;
    updates.next_run_at = computeNextRun(
      cron_expression,
      cron_timezone ?? existing.cron_timezone,
    )?.toISOString();
  }
  if (enabled !== undefined) updates.enabled = enabled;
  if (cron_timezone !== undefined) updates.cron_timezone = cron_timezone;

  const { data, error } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
