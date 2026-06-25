"use client";
import { useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackInner />
    </Suspense>
  );
}

function OAuthCallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = params.get("token");
    if (!token) {
      router.replace("/login?error=oauth");
      return;
    }

    fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((user: {
        id: string;
        email: string;
        role: string;
        display_name?: string | null;
        avatar_url?: string | null;
      }) => {
        login(token, {
          id: user.id,
          email: user.email,
          role: user.role ?? "user",
          display_name: user.display_name,
          avatar_url: user.avatar_url,
        });
        // Trigger the deep link callback for the desktop app
        window.location.href = `fayde://auth/oauth-callback?token=${token}`;
        setTimeout(() => {
          router.replace("/tasks");
        }, 1500);
      })
      .catch(() => router.replace("/login?error=oauth"));
  }, [params, router, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-7 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
