"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginPage } from "@takaki/go-design-system";

function LoginContent() {
  const searchParams = useSearchParams();
  const _error = searchParams.get("error");

  async function handleGoogleSignIn() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <LoginPage
      productName="MetaGo"
      productLogo={
        <div
          className="flex items-center justify-center rounded-md p-2"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <span className="text-sm font-semibold text-white">M</span>
        </div>
      }
      tagline="PSF Product Manager — goシリーズの自律管理プラットフォーム"
      onGoogleSignIn={handleGoogleSignIn}
    />
  );
}

export default function LoginPageRoute() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
