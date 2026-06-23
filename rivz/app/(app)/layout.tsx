"use client";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivitySidebar } from "@/app/(app)/_components/ActivitySidebar";
import { AppSidebar } from "@/app/(app)/_components/AppSidebar";
import { CommandPaletteProvider } from "@/components/CommandPalette";
import { QuickCaptureProvider } from "@/lib/quick-capture-context";
import { QuickCaptureDialog } from "@/components/QuickCaptureDialog";
import { PomodoroTimer } from "@/components/PomodoroTimer";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { PageTracker } from "@/components/PageTracker";
import { TooltipProvider } from "@/components/ui/tooltip";

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

  return (
    <TooltipProvider>
    <QuickCaptureProvider>
    <CommandPaletteProvider>
    <PageTracker userId={user?.id} />
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        user={user}
        onActivityOpen={() => setActivityOpen((v) => !v)}
        onLogout={logout}
      />
      <SidebarInset>
        {/* Minimal top bar */}
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-md px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex-1" />
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 animate-in fade-in-0 slide-in-from-bottom-3 duration-400">
          {children}
        </main>
      </SidebarInset>

      <ActivitySidebar open={activityOpen} onClose={() => setActivityOpen(false)} />
      <QuickCaptureDialog />
      <PomodoroTimer />
    </SidebarProvider>
    </CommandPaletteProvider>
    </QuickCaptureProvider>
    </TooltipProvider>
  );
}
