"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useDashboard, type TaskBrief } from "@/lib/dashboard-hooks";
import { usePlanDay } from "@/lib/ai-hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Sun,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Timer,
  Flame,
  Clock,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const PRIORITY_COLOR: Record<string, string> = {
  high: "text-rose-500",
  medium: "text-amber-500",
  low: "text-blue-500",
};

function Stat({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={cn("flex items-center gap-1.5 text-xs font-medium", tint)}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function TaskList({ tasks, empty }: { tasks: TaskBrief[]; empty: string }) {
  if (tasks.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground text-center">{empty}</p>;
  }
  return (
    <div className="divide-y divide-border">
      {tasks.slice(0, 6).map((t) => (
        <Link
          key={t.id}
          href={`/tasks/${t.id}`}
          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
        >
          <span className={cn("size-1.5 rounded-full bg-current shrink-0", PRIORITY_COLOR[t.priority])} />
          <span className="truncate flex-1">{t.title}</span>
          {t.due_date && (
            <span className="text-xs text-muted-foreground shrink-0">
              {format(parseISO(t.due_date), "MMM d")}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function Panel({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
        </span>
        <Link href={href} className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" />
        </Link>
      </div>
      {children}
    </div>
  );
}

interface PlanItem {
  number: number;
  time: string;
  task: string;
  isBreak: boolean;
}

function parsePlan(planText: string) {
  if (!planText) return { intro: "", items: [], conclusion: "" };
  
  const lines = planText.split("\n");
  const introLines: string[] = [];
  const items: PlanItem[] = [];
  const conclusionLines: string[] = [];
  let hasParsedList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line looks like a list item: "1. ..."
    const listPrefixMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
    if (listPrefixMatch) {
      hasParsedList = true;
      const num = parseInt(listPrefixMatch[1], 10);
      const content = listPrefixMatch[2];

      // Try to extract time range: e.g. "**09:00-10:30**" or "09:00-10:30"
      let time = "";
      let task = content;

      // Match time range like 09:00-10:30 or 09:00 - 10:30
      const timeRegex = /(?:\*\*)?(\d{1,2}:\d{2}\s*[-—–]\s*\d{1,2}:\d{2})(?:\*\*)?/;
      const timeMatch = content.match(timeRegex);
      if (timeMatch) {
        time = timeMatch[1].trim();
        task = content.replace(timeRegex, "").trim();
      }

      // Clean up the task description
      task = task.replace(/^[—\-–]\s*/, "")
                 .replace(/^:\s*/, "")
                 .replace(/^[—\-–]\s*/, "")
                 .replace(/\*\*/g, "")
                 .trim();

      const isBreak = task.toLowerCase().includes("break");
      items.push({ number: num, time, task, isBreak });
    } else {
      if (trimmed.startsWith("###")) {
        introLines.push(trimmed.replace(/^###\s*/, ""));
      } else if (hasParsedList) {
        conclusionLines.push(trimmed);
      } else {
        introLines.push(trimmed);
      }
    }
  }

  // Fallback in case formatting matches absolutely nothing
  if (items.length === 0) {
    return { intro: planText, items: [], conclusion: "" };
  }

  return {
    intro: introLines.join("\n"),
    items,
    conclusion: conclusionLines.join("\n"),
  };
}

function PlanMyDay() {
  const planDay = usePlanDay();
  const [open, setOpen] = useState(false);

  const run = () => {
    setOpen(true);
    planDay.mutate({});
  };

  const renderContent = () => {
    if (planDay.isPending) {
      return (
        <div className="space-y-2.5 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      );
    }

    if (planDay.isError) {
      return (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Couldn&apos;t generate a plan. Make sure AI is configured and you have open tasks.
        </p>
      );
    }

    const parsed = parsePlan(planDay.data?.plan ?? "");

    if (parsed.items.length === 0) {
      return (
        <pre className="text-sm whitespace-pre-wrap font-sans max-h-[60vh] overflow-y-auto bg-muted/40 p-4 rounded-xl border border-border">
          {planDay.data?.plan}
        </pre>
      );
    }

    return (
      <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
        {parsed.intro && (
          <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-3.5 text-xs text-muted-foreground leading-relaxed animate-in fade-in-0 duration-300">
            {parsed.intro}
          </div>
        )}

        <div className="relative pl-6 space-y-3.5 border-l border-border/75 ml-3 py-1">
          {parsed.items.map((item, idx) => (
            <div
              key={idx}
              className="relative group animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
            >
              {/* Timeline dot */}
              <span className={cn(
                "absolute -left-[30px] top-1.5 flex items-center justify-center size-3 rounded-full border bg-background transition-all duration-300",
                item.isBreak
                  ? "border-muted-foreground/30 bg-muted/50"
                  : "border-primary bg-primary ring-4 ring-primary/5"
              )} />

              {/* Card item */}
              <div className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border transition-all duration-200",
                item.isBreak
                  ? "bg-muted/15 border-border/40 hover:bg-muted/25 text-muted-foreground"
                  : "bg-card border-border hover:border-primary/20 hover:shadow-xs text-foreground"
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "inline-flex items-center justify-center text-[9px] font-bold shrink-0 size-4 rounded-full",
                    item.isBreak ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {item.number}
                  </span>
                  <span className={cn(
                    "text-sm font-medium leading-none truncate",
                    item.isBreak && "text-muted-foreground/75"
                  )}>
                    {item.task}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <Clock className="size-3 text-muted-foreground/60" />
                  <span className="text-[11px] font-mono font-medium text-muted-foreground">{item.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {parsed.conclusion && (
          <div className="text-[10px] text-muted-foreground/70 text-center px-4 leading-relaxed border-t border-border/40 pt-3.5">
            {parsed.conclusion}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} className="gap-1.5">
        <Sparkles className="size-4 text-violet-500" />
        Plan my day
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-500" /> Your plan for today
            </DialogTitle>
          </DialogHeader>
          {renderContent()}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  const hours = Math.floor(data.time_this_week_minutes / 60);
  const mins = data.time_this_week_minutes % 60;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Good day 👋</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s your snapshot.</p>
        </div>
        <PlanMyDay />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Sun className="size-3.5" />} label="Due today" value={data.due_today.length} tint="text-amber-500" />
        <Stat icon={<AlertCircle className="size-3.5" />} label="Overdue" value={data.overdue.length} tint="text-rose-500" />
        <Stat icon={<CheckCircle2 className="size-3.5" />} label="Done this week" value={data.completed_this_week} tint="text-emerald-500" />
        <Stat icon={<Clock className="size-3.5" />} label="Tracked this week" value={`${hours}h ${mins}m`} tint="text-blue-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Panel title="Due today" icon={<Sun className="size-4 text-amber-500" />} href="/tasks?list=today">
          <TaskList tasks={data.due_today} empty="Nothing due today 🎉" />
        </Panel>
        <Panel title="Overdue" icon={<AlertCircle className="size-4 text-rose-500" />} href="/tasks?list=overdue">
          <TaskList tasks={data.overdue} empty="No overdue tasks" />
        </Panel>
        <Panel title="Upcoming" icon={<CalendarClock className="size-4 text-violet-500" />} href="/tasks?list=upcoming">
          <TaskList tasks={data.upcoming} empty="Nothing scheduled" />
        </Panel>
        <Panel title="Habits" icon={<Flame className="size-4 text-orange-500" />} href="/habits">
          {data.habits.length === 0 ? (
            <Link href="/habits" className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground hover:text-foreground justify-center">
              <Plus className="size-4" /> Start a habit
            </Link>
          ) : (
            <div className="divide-y divide-border">
              {data.habits.slice(0, 6).map((h) => (
                <div key={h.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="size-2 rounded-full shrink-0" style={{ background: h.color ?? "#22c55e" }} />
                  <span className="truncate flex-1">{h.name}</span>
                  <span className={cn("flex items-center gap-1 text-xs", h.done_today ? "text-emerald-500" : "text-muted-foreground")}>
                    <Flame className="size-3" />
                    {h.current_streak}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Timer className="size-3.5" />
        {data.pomodoros_today} pomodoros today · {data.created_this_week} tasks created this week
      </div>
    </div>
  );
}
