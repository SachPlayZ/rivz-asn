"use client";
import { useState, Suspense, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useResendVerification } from "@/lib/verify-hooks";
import { Mail } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error") === "oauth";

  useEffect(() => {
    if (user) {
      router.replace("/tasks");
    }
  }, [user, router]);

  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const { mutate: resend, isPending: resending } = useResendVerification();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setUnverifiedEmail(null);
    try {
      const res = await api.post<{
        token: string;
        user: {
          id: string;
          email: string;
          role: string;
          display_name?: string | null;
          avatar_url?: string | null;
        };
      }>("/auth/login", data);
      login(res.token, {
        id: res.user.id,
        email: res.user.email,
        role: res.user.role ?? "user",
        display_name: res.user.display_name,
        avatar_url: res.user.avatar_url,
      });
      router.replace("/tasks");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setUnverifiedEmail(data.email);
          return;
        }
        if (err.fields) {
          Object.entries(err.fields).forEach(([field, message]) => {
            setError(field as keyof LoginInput, { message });
          });
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    }
  };

  const handleResend = () => {
    if (!unverifiedEmail) return;
    resend(unverifiedEmail, {
      onSuccess() {
        toast.success("Verification email sent — check your inbox");
      },
    });
  };

  const handleOAuth = async (provider: "google" | "github") => {
    const isTauri =
      typeof window !== "undefined" &&
      (window as any).__TAURI_INTERNALS__ !== undefined;
    const url = isTauri
      ? `${BASE_URL}/auth/${provider}?platform=desktop`
      : `${BASE_URL}/auth/${provider}`;

    if (isTauri) {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } catch (err) {
        console.error("Tauri opener failed", err);
        window.location.href = url;
      }
    } else {
      window.location.href = url;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center animate-in fade-in-0 slide-in-from-bottom-4 duration-500 stagger-1">
          <Image src="/logo.png" alt="Fayde" width={48} height={48} className="size-12 rounded-xl mx-auto mb-4" priority />
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your Fayde account</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in-0 slide-in-from-bottom-4 duration-500 stagger-2 flex flex-col gap-4">
          {oauthError && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-xs px-3 py-2">
              Social login failed. Please try again.
            </div>
          )}

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => handleOAuth("google")}
            >
              <GoogleIcon />
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => handleOAuth("github")}
            >
              <GitHubIcon />
              Continue with GitHub
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Unverified email banner */}
          {unverifiedEmail && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Email not verified</p>
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Check your inbox for a verification link, or resend it below.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full text-xs h-7 border-amber-500/40"
                disabled={resending}
                onClick={handleResend}
              >
                {resending ? "Sending…" : "Resend verification email"}
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-sm text-center text-muted-foreground mt-4 animate-in fade-in-0 duration-500 stagger-3">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
