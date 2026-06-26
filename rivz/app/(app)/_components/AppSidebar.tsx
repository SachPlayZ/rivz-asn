"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Flame,
  Target,
  FolderKanban,
  Zap,
  FileText,
  Brain,
  Settings,
  ShieldCheck,
  Activity,
  LogOut,
  ChevronsUpDown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navMain = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/habits", label: "Habits", icon: Flame },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Zap },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/focus", label: "Focus", icon: Brain },
];

const navSecondary = [
  { href: "/settings", label: "Settings", icon: Settings },
];

type Props = {
  user: {
    email: string;
    role: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  onActivityOpen: () => void;
  onLogout: () => void;
};

export function AppSidebar({ user, onActivityOpen, onLogout }: Props) {
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  const initials = (() => {
    if (!user) return "??";
    if (user.display_name) {
      const parts = user.display_name.trim().split(/\s+/);
      const firstChars = parts.map(p => p[0]).filter(Boolean).join("");
      if (firstChars.length > 0) {
        return firstChars.slice(0, 2).toUpperCase();
      }
    }
    return user.email.slice(0, 2).toUpperCase();
  })();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="bg-sidebar/85 backdrop-blur-md border-r border-sidebar-border/30 shadow-xs transition-all duration-300"
    >
      {/* Brand */}
      <SidebarHeader className={cn("py-4 flex flex-row items-center gap-1.5", collapsed ? "px-2 justify-center" : "px-3 justify-between")}>
        {collapsed ? (
          <Button
            variant="ghost"
            onClick={toggleSidebar}
            className="relative size-8 rounded-lg overflow-hidden p-0 shadow-md ring-1 ring-sidebar-border/50 hover:ring-sidebar-primary/30 transition-all duration-300 hover:bg-sidebar-accent/50 shrink-0 flex items-center justify-center"
          >
            <Image
              src="/logo.png"
              alt="Fayde"
              width={24}
              height={24}
              className="object-cover"
              priority
            />
          </Button>
        ) : (
          <>
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-all duration-300 hover:bg-sidebar-accent/50 group min-w-0 flex-1"
            >
              <div className="relative size-7 rounded-lg overflow-hidden shrink-0 shadow-md ring-1 ring-sidebar-border/50 group-hover:ring-sidebar-primary/30 group-hover:rotate-6 transition-all duration-300">
                <Image
                  src="/logo.png"
                  alt="Fayde"
                  width={28}
                  height={28}
                  className="size-full object-cover"
                  priority
                />
              </div>
              <span className="font-semibold text-sm tracking-tight text-sidebar-foreground/90 transition-all duration-300 group-hover:text-sidebar-foreground">
                Fayde
              </span>
            </Link>
            <SidebarTrigger
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 size-8 rounded-lg transition-all duration-200 ease-out active:scale-95 shrink-0"
            />
          </>
        )}
      </SidebarHeader>

      <SidebarSeparator className="opacity-50" />

      {/* Main nav */}
      <SidebarContent className="py-2">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/35 px-3 mb-1.5 animate-in fade-in-0 duration-300">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={active}
                      tooltip={label}
                      className={cn(
                        "relative h-9.5 rounded-lg transition-all duration-200 ease-out group/btn",
                        active
                          ? "bg-gradient-to-r from-sidebar-primary/8 via-sidebar-primary/3 to-transparent text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary rounded-l-none pl-2.5 shadow-[inset_1px_0_0_0_rgba(var(--sidebar-primary),0.05)]"
                          : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 hover:translate-x-0.5"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-all duration-200 group-hover/btn:scale-105",
                          active
                            ? "text-sidebar-primary"
                            : "text-sidebar-foreground/60 group-hover/btn:text-sidebar-foreground/90"
                        )}
                      />
                      <span className="text-sm">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-50" />

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/35 px-3 mb-1.5 animate-in fade-in-0 duration-300">
              System
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navSecondary.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={active}
                      tooltip={label}
                      className={cn(
                        "h-9.5 rounded-lg transition-all duration-200 ease-out group/btn",
                        active
                          ? "bg-gradient-to-r from-sidebar-primary/8 via-sidebar-primary/3 to-transparent text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary rounded-l-none pl-2.5"
                          : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 hover:translate-x-0.5"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-all duration-200 group-hover/btn:scale-105",
                          active
                            ? "text-sidebar-primary"
                            : "text-sidebar-foreground/60 group-hover/btn:text-sidebar-foreground/90"
                        )}
                      />
                      <span className="text-sm">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {user?.role === "admin" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin" />}
                    isActive={isActive("/admin")}
                    tooltip="Admin"
                    className={cn(
                      "h-9.5 rounded-lg transition-all duration-200 ease-out group/btn",
                      isActive("/admin")
                        ? "bg-gradient-to-r from-sidebar-primary/8 via-sidebar-primary/3 to-transparent text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary rounded-l-none pl-2.5"
                        : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 hover:translate-x-0.5"
                    )}
                  >
                    <ShieldCheck className={cn(
                      "size-4 shrink-0 transition-all duration-200 group-hover/btn:scale-105",
                      isActive("/admin") ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover/btn:text-sidebar-foreground/90"
                    )} />
                    <span className="text-sm">Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — user menu */}
      <SidebarSeparator className="opacity-50" />
      <SidebarFooter className="py-3 px-2">
        {/* Quick actions dock */}
        <div
          className={cn(
            "flex items-center transition-all duration-300",
            collapsed 
              ? "justify-center flex-col gap-2 mb-1" 
              : "justify-between gap-1 mb-2 bg-sidebar-accent/25 border border-sidebar-border/15 rounded-xl p-1 px-1.5"
          )}
        >
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <NotificationsBell />
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onActivityOpen}
            aria-label="Activity log"
            className="size-7 rounded-lg hover:scale-105 hover:bg-background/80 active:scale-95 transition-all duration-200"
          >
            <Activity className="size-4 text-sidebar-foreground/70" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "w-full h-10 gap-2 rounded-xl px-2 transition-all duration-200 border border-transparent hover:border-sidebar-border/30 hover:bg-sidebar-accent/40",
                  collapsed ? "justify-center" : "justify-between"
                )}
              />
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative size-6.5 rounded-full overflow-hidden shrink-0 ring-1 ring-sidebar-primary/20 bg-gradient-to-tr from-sidebar-primary/20 to-sidebar-primary/10 flex items-center justify-center">
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user.display_name || user.email}
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-sidebar-primary text-[10px] font-bold">
                    {initials}
                  </span>
                )}
              </div>
              {!collapsed && (
                <div className="flex flex-col items-start min-w-0 leading-tight">
                  <span className="text-xs text-sidebar-foreground/90 font-medium truncate max-w-28">
                    {user?.display_name || user?.email}
                  </span>
                  {user?.display_name && (
                    <span className="text-[10px] text-sidebar-foreground/50 truncate max-w-28">
                      {user.email}
                    </span>
                  )}
                </div>
              )}
            </div>
            {!collapsed && (
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-200 group-data-[open]:rotate-180" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-48 animate-in fade-in-0 duration-200">
            <DropdownMenuItem
              render={<Link href="/settings" className="flex items-center gap-2 w-full" />}
            >
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
