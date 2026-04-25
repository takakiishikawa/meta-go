/**
 * Vercel Cron が定期的にこのエンドポイントを叩く。
 * workflow_schedules を読み、due になっている workflow を GitHub workflow_dispatch で起動する。
 *
 * 認証: Vercel Cron は自動で `Authorization: Bearer ${CRON_SECRET}` を付ける（vercel.json で
 * crons を設定すれば自動）。手動実行は SUPABASE_SERVICE_ROLE_KEY でも可。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dispatchDueWorkflows } from "@/lib/metago/workflow-dispatcher";

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isVercelCron = cronSecret && auth === `Bearer ${cronSecret}`;
  const isManual = serviceKey && auth === `Bearer ${serviceKey}`;

  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await dispatchDueWorkflows(supabase);
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    ...result,
  });
}
