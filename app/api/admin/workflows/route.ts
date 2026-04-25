/**
 * GET /api/admin/workflows — 一覧取得（UI用）
 *
 * 認証: 通常のサイト認証（Supabase Auth経由のtakakiのみ）に依拠。
 * RLSポリシーで is_takaki() のみ読み書きできる。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
