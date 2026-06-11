"use client";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/app/(app)/_components/ThemeToggle";
import { ActivitySidebar } from "@/app/(app)/_components/ActivitySidebar";
import { LogOut, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
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

  if (!user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-sm tracking-tight">TaskFlow</span>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:block mr-1">
              {user.email}
            </span>
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold select-none">
              {initials}
            </div>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setActivityOpen((v) => !v)}
              aria-label="Toggle activity log"
              className={activityOpen ? "bg-muted" : ""}
            >
              <Activity className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {children}
      </main>

      <ActivitySidebar open={activityOpen} onClose={() => setActivityOpen(false)} />
    </div>
  );
}
