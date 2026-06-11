"use client";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/app/(app)/_components/ThemeToggle";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    if (!loading && user && user.role !== "admin") {
      router.replace("/tasks");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-7 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight">TaskFlow</span>
            <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <ShieldCheck className="size-2.5" />
              Admin
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:block mr-1">
              {user.email}
            </span>
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold select-none">
              {initials}
            </div>
            <ThemeToggle />
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
