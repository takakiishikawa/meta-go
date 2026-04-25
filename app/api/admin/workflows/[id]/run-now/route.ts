/**
 * POST /api/admin/workflows/[id]/run-now — 即時実行
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/metago/workflow-dispatcher";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sched, error: fetchErr } = await supabase
    .schema("metago")
    .from("workflow_schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !sched) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const dispatch = await dispatchWorkflow(sched.workflow_file);
  if (!dispatch.ok) {
    return NextResponse.json(
      { error: dispatch.error, status: dispatch.status },
      { status: 500 },
    );
  }

  await supabase
    .schema("metago")
    .from("workflow_schedules")
    .update({
      last_run_at: dispatch.dispatchedAt,
      last_run_status: "running",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, dispatched_at: dispatch.dispatchedAt });
}
