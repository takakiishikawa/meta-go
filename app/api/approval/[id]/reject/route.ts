import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function parsePrUrl(url: string) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: parseInt(m[3]) };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: item } = await supabase
    .schema("metago")
    .from("approval_queue")
    .select("*")
    .eq("id", id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.state !== "pending") {
    return NextResponse.json({ error: "Already resolved" }, { status: 409 });
  }

  const prUrl = item.meta?.pr_url as string | null;
  if (prUrl) {
    const pr = parsePrUrl(prUrl);
    if (pr) {
      await fetch(
        `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${process.env.GH_PAT || process.env.GITHUB_TOKEN || ""}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state: "closed" }),
        },
      );
    }
  }

  await supabase
    .schema("metago")
    .from("approval_queue")
    .update({ state: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
