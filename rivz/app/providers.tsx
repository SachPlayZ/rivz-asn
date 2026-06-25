"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useSSE } from "@/lib/sse-hook";
import { Toaster } from "sonner";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * SSEConnector always calls useSSE (satisfies Rules of Hooks) but the hook
 * itself checks for a token before opening a connection.
 */
function SSEConnector() {
  useSSE();
  return null;
}

function InnerProviders({ children }: { children: React.ReactNode }) {
  const { user, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const isTauri =
      typeof window !== "undefined" &&
      (window as any).__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) return;

    let unsubscribe: (() => void) | undefined;

    const setupDeepLink = async () => {
      try {
        const { onOpenUrl, getCurrent } = await import(
          "@tauri-apps/plugin-deep-link"
        );

        const handleUrl = async (urlStr: string) => {
          console.log("Deep link received:", urlStr);
          try {
            const urlObj = new URL(urlStr);
            const token = urlObj.searchParams.get("token");
            if (token) {
              const apiURL =
                process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
              const r = await fetch(`${apiURL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (r.ok) {
                const u = await r.json();
                login(token, {
                  id: u.id,
                  email: u.email,
                  role: u.role ?? "user",
                  display_name: u.display_name,
                  avatar_url: u.avatar_url,
                });
                router.replace("/tasks");
              }
            }
          } catch (e) {
            console.error("Failed to parse deep link url", e);
          }
        };

        const initialUrls = await getCurrent();
        if (initialUrls && initialUrls.length > 0) {
          handleUrl(initialUrls[0]);
        }

        unsubscribe = await onOpenUrl((urls) => {
          if (urls && urls.length > 0) {
            handleUrl(urls[0]);
          }
        });
      } catch (err) {
        console.error("Deep link listener setup failed", err);
      }
    };

    setupDeepLink();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [login]);

  return (
    <>
      {user && <SSEConnector />}
      {children}
    </>
  );
}

function SWRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <InnerProviders>{children}</InnerProviders>
          <Toaster />
          <SWRegistrar />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
