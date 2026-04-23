import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .schema("metago")
    .from("products")
    .select("*")
    .eq("name", slug)
    .single();

  if (!product) notFound();

  const [
    qualityRes,
    securityRes,
    depRes,
    dsRes,
    perfRes,
    psfRes,
    hypoRes,
    backlogRes,
  ] = await Promise.all([
    supabase
      .schema("metago")
      .from("quality_items")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("security_items")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("design_system_items")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("performance_metrics")
      .select("*")
      .eq("product_id", product.id)
      .order("measured_at", { ascending: false })
      .limit(10),
    supabase
      .schema("metago")
      .from("psf_scores")
      .select("*")
      .eq("product_id", product.id)
      .order("collected_at", { ascending: false })
      .limit(10),
    supabase
      .schema("metago")
      .from("hypotheses")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("backlog")
      .select("*")
      .eq("product_id", product.id)
      .order("priority")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ProductDetailClient
      product={product}
      qualityItems={qualityRes.data ?? []}
      securityItems={securityRes.data ?? []}
      dependencyItems={depRes.data ?? []}
      designSystemItems={dsRes.data ?? []}
      performanceMetrics={perfRes.data ?? []}
      psfScores={psfRes.data ?? []}
      hypotheses={hypoRes.data ?? []}
      backlog={backlogRes.data ?? []}
    />
  );
}
