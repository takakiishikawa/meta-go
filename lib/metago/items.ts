/**
 * scan/fix 共通: items テーブル (quality / design_system / security) の
 * UPSERT、ピック、状態遷移ヘルパ
 *
 * state machine:
 *   new       — scanで検出された未処理の違反
 *   fixing    — fix-cron が処理中（ロック）
 *   fixed     — 修正PRがマージされた
 *   failed    — 修正失敗（リトライ上限超過）
 *   done      — レガシー（fixedと同義、後方互換のため残す）
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type ItemState = "new" | "fixing" | "fixed" | "failed" | "done";

export type ItemTable =
  | "quality_items"
  | "design_system_items"
  | "security_items";

export const MAX_FIX_ATTEMPTS = 3;
export const DEFAULT_BATCH_SIZE = 10;

// "done" はレガシー、"fixed" が現行。両方を解決済み扱いするための共通ヘルパ。
export function isResolved(state: string | null | undefined): boolean {
  return state === "fixed" || state === "done";
}

// ────────────────────────────────────────────────
// Supabase client
// ────────────────────────────────────────────────

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ────────────────────────────────────────────────
// SCAN: UPSERT (state は既存のものを保持)
// ────────────────────────────────────────────────

export interface UpsertItemInput {
  product_id: string;
  category: string;
  title: string;
  description?: string;
  level?: "L1" | "L2" | "L3";
  /** security_items のみ */
  severity?: "critical" | "high" | "medium" | "low";
  /** security_items のみ */
  cve?: string | null;
}

/**
 * 違反/問題itemをUPSERT。同じキー (product_id, category[+severity], title) が既に
 * あればdescription/last_seen_atだけ更新し、stateは保持する。
 *
 * 新規挿入時は state='new'。
 */
export async function upsertItem(
  supabase: SupabaseClient,
  table: ItemTable,
  input: UpsertItemInput,
): Promise<void> {
  const conflictTarget =
    table === "security_items"
      ? "product_id,severity,title"
      : "product_id,category,title";

  const row: Record<string, unknown> = {
    product_id: input.product_id,
    category: input.category,
    title: input.title.substring(0, 200),
    description: input.description?.substring(0, 500) ?? null,
    last_seen_at: new Date().toISOString(),
  };

  if (input.level) row.level = input.level;
  if (table === "security_items") {
    row.severity = input.severity;
    row.cve = input.cve ?? null;
  }

  const { error } = await supabase
    .schema("metago")
    .from(table)
    .upsert(row, { onConflict: conflictTarget, ignoreDuplicates: false });

  if (error) {
    // サイレント失敗を許さない: scan で 1 行落ちると次の markStaleItemsResolved
    // と整合が取れなくなり ghost 行を生む。throw して呼び出し側 (scanRepo の
    // try/catch) で execution_logs に記録させる。
    throw new Error(`upsertItem failed (${table}): ${error.message}`);
  }
}

/**
 * 当該 scan 実行で再検出されなかった items を fixed に遷移させる。
 *
 * scan は最新の所見を upsertItem で書き込む際に last_seen_at を now() に更新する。
 * scanStartedAt より前の last_seen_at を持つ state IN ('new','fixing') の行は、
 * 今回の scan では検出されなかった = 解消済み とみなせる。
 *
 * categories を渡すと、その category 集合内のみを対象にする(scan が部分的に成功した
 * 場合、評価できなかった category の行を誤って fixed にしないため)。
 *
 * 呼び出し側の前提: scanStartedAt は scan 開始時刻(upsertItem の前に決定する)。
 */
export async function markStaleItemsResolved(
  supabase: SupabaseClient,
  table: ItemTable,
  productId: string,
  scanStartedAt: Date,
  categories?: string[],
): Promise<number> {
  let q = supabase
    .schema("metago")
    .from(table)
    .update({ state: "fixed", resolved_at: new Date().toISOString() })
    .eq("product_id", productId)
    .in("state", ["new", "fixing"])
    .lt("last_seen_at", scanStartedAt.toISOString())
    .select("id");

  if (categories && categories.length > 0) {
    q = q.in("category", categories);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(
      `markStaleItemsResolved failed (${table}): ${error.message}`,
    );
  }
  return data?.length ?? 0;
}

// ────────────────────────────────────────────────
// FIX: pending items のピック (state='new' を 'fixing' に遷移)
// ────────────────────────────────────────────────

export interface PendingItem {
  id: string;
  product_id: string;
  category: string;
  title: string;
  description: string | null;
  attempt_count: number;
  level?: string;
  severity?: string;
  products?: {
    name: string;
    display_name: string;
    github_repo: string;
  };
}

/**
 * fix-cron が処理する候補を取得。
 *  - state='new'
 *  - attempt_count < MAX_FIX_ATTEMPTS
 * 取得した行はすぐ state='fixing' にロックする（同時実行で同じitemを処理しないため）。
 *
 * targetRepo を渡すと該当product_idのみに絞る。
 */
export async function pickAndLockItems(
  supabase: SupabaseClient,
  table: ItemTable,
  options: {
    productId?: string;
    limit?: number;
  } = {},
): Promise<PendingItem[]> {
  const limit = options.limit ?? DEFAULT_BATCH_SIZE;

  // severity 列は security_items にのみ存在する。design_system_items / quality_items
  // で severity を select すると Postgres は 42703 を返し、PostgREST 経由では
  // data=null で error 付きになる。共通の select を使うと design-system fix が
  // サイレントに毎回 0 件となり詰まるため、テーブル別に分岐する。
  const baseCols = `id, product_id, category, title, description, attempt_count, level, products(name, display_name, github_repo)`;
  const cols = table === "security_items" ? `${baseCols}, severity` : baseCols;

  let query = supabase
    .schema("metago")
    .from(table)
    .select(cols)
    .eq("state", "new")
    .lt("attempt_count", MAX_FIX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.productId) query = query.eq("product_id", options.productId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`pickAndLockItems failed (${table}): ${error.message}`);
  }

  const items = (data ?? []) as unknown as PendingItem[];
  if (items.length === 0) return [];

  // ロック取得（state='fixing' に遷移）
  const ids = items.map((i) => i.id);
  const { error: lockErr } = await supabase
    .schema("metago")
    .from(table)
    .update({
      state: "fixing",
      last_attempted_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (lockErr) {
    console.warn(`  lock failed (${table}):`, lockErr.message);
    return [];
  }

  return items;
}

// ────────────────────────────────────────────────
// FIX: 成功/失敗の状態更新
// ────────────────────────────────────────────────

export async function markItemFixed(
  supabase: SupabaseClient,
  table: ItemTable,
  itemIds: string[],
  prUrl: string,
): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .schema("metago")
    .from(table)
    .update({
      state: "fixed",
      pr_url: prUrl,
      resolved_at: new Date().toISOString(),
      error_message: null,
    })
    .in("id", itemIds);
  if (error) console.warn(`  mark fixed failed (${table}):`, error.message);
}

export async function markItemFailed(
  supabase: SupabaseClient,
  table: ItemTable,
  itemIds: string[],
  errorMessage: string,
): Promise<void> {
  if (itemIds.length === 0) return;

  // 失敗回数を取得して、上限到達なら 'failed'、未満なら 'new' に戻す
  const { data: rows } = await supabase
    .schema("metago")
    .from(table)
    .select("id, attempt_count")
    .in("id", itemIds);

  for (const row of rows ?? []) {
    const newCount = (row.attempt_count ?? 0) + 1;
    const newState = newCount >= MAX_FIX_ATTEMPTS ? "failed" : "new";
    await supabase
      .schema("metago")
      .from(table)
      .update({
        state: newState,
        attempt_count: newCount,
        error_message: errorMessage.substring(0, 500),
      })
      .eq("id", row.id);
  }
}

// ────────────────────────────────────────────────
// SCAN: scores_history を category別に upsert
// ────────────────────────────────────────────────

export async function saveScore(
  supabase: SupabaseClient,
  productId: string,
  category: string,
  score: number,
): Promise<void> {
  // 1日1行/product/category の制約 (uniq_scores_history_product_cat_day) に
  // 沿って upsert。同日内の再scanでは score / collected_at を上書きする。
  // day 列は collected_at から自動算出される generated column なので渡さない。
  const { error } = await supabase
    .schema("metago")
    .from("scores_history")
    .upsert(
      {
        product_id: productId,
        category,
        score,
        collected_at: new Date().toISOString(),
      },
      { onConflict: "product_id,category,day" },
    );

  if (error) {
    throw new Error(`saveScore failed: ${error.message}`);
  }
}

// ────────────────────────────────────────────────
// 共通: GO_REPOS マッピング
// ────────────────────────────────────────────────

export const GO_REPOS: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
  designsystem: "go-design-system",
  metago: "meta-go",
};

export const REPO_TO_SLUG: Record<string, string> = {
  "native-go": "nativego",
  "care-go": "carego",
  "kenyaku-go": "kenyakugo",
  "cook-go": "cookgo",
  "physical-go": "physicalgo",
  "task-go": "taskgo",
  "go-design-system": "designsystem",
  "meta-go": "metago",
};
