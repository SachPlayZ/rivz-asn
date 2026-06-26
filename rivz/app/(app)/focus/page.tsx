"use client";
import { useState, useEffect, useRef } from "react";
import {
  useActiveFocusSession,
  useFocusHistory,
  useFocusStats,
  useStartFocusSession,
  useEndFocusSession,
  useDeleteFocusSession,
  type FocusSession,
} from "@/lib/focus-hooks";
import { useTasks } from "@/lib/tasks-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Brain,
  Play,
  Square,
  Trash2,
  Clock,
  Flame,
  BarChart2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

function useElapsed(startedAt: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calc = () =>
    startedAt
      ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      : 0;
  const [elapsed, setElapsed] = useState(calc);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!startedAt) return;
    intervalRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
      1000
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  return elapsed;
}

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ActiveSession({ session }: { session: FocusSession }) {
  const elapsed = useElapsed(session.started_at);
  const end = useEndFocusSession();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const handleEnd = () => {
    end.mutate(
      { notes },
      {
        onSuccess: () => toast.success("Focus session ended"),
        onError: () => toast.error("Failed to end session"),
      }
    );
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <span className="relative flex size-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
          </span>
          <span className="text-sm font-semibold">In focus</span>
        </div>
        <span className="text-xs text-muted-foreground">
          started {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
        </span>
      </div>

      <div className="text-center">
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums">
          {formatSeconds(elapsed)}
        </p>
        {session.intention && (
          <p className="mt-2 text-sm text-muted-foreground italic">
            &ldquo;{session.intention}&rdquo;
          </p>
        )}
        {session.task_title && (
          <p className="mt-1 text-xs text-muted-foreground">
            Working on: <span className="font-medium text-foreground">{session.task_title}</span>
          </p>
        )}
      </div>

      {showNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes (optional)…"
          className="resize-none text-sm min-h-20"
          autoFocus
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setShowNotes((v) => !v)}
        >
          {showNotes ? "Hide notes" : "Add notes"}
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={handleEnd}
          disabled={end.isPending}
        >
          <Square className="size-3.5 fill-current" />
          End session
        </Button>
      </div>
    </div>
  );
}

function StartSession() {
  const start = useStartFocusSession();
  const { data: tasksRes } = useTasks({ status: "todo", limit: 100 });
  const tasks = tasksRes?.data ?? [];
  const [intention, setIntention] = useState("");
  const [taskId, setTaskId] = useState("");

  const handleStart = () => {
    start.mutate(
      { intention: intention.trim() || undefined, task_id: taskId || undefined },
      {
        onSuccess: () => {
          setIntention("");
          setTaskId("");
          toast.success("Focus session started");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "";
          if (msg.includes("already active") || msg.includes("409")) {
            toast.error("You already have an active session");
          } else {
            toast.error("Failed to start session");
          }
        },
      }
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
      <h3 className="font-semibold text-sm">Start a focus session</h3>

      <div className="flex flex-col gap-3">
        <Input
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          placeholder="What's your intention? (optional)"
          className="text-sm"
        />

        {tasks.length > 0 && (
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">No task (free focus)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <Button onClick={handleStart} disabled={start.isPending} className="gap-1.5">
        <Play className="size-4 fill-current" />
        Start focus
      </Button>
    </div>
  );
}

function StatsRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
    </div>
  );
}

function HistoryItem({
  session,
  onDelete,
}: {
  session: FocusSession;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {session.intention || "Focus session"}
          </span>
          {session.task_title && (
            <span className="text-xs text-muted-foreground truncate">
              — {session.task_title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {session.duration_min != null ? `${session.duration_min} min` : "—"}
          </span>
          <span>{format(new Date(session.started_at), "MMM d, h:mm a")}</span>
        </div>
        {session.notes && (
          <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
            {session.notes}
          </p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(session.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export default function FocusPage() {
  const { data: active, isLoading: loadingActive } = useActiveFocusSession();
  const { data: history, isLoading: loadingHistory } = useFocusHistory();
  const { data: stats } = useFocusStats();
  const del = useDeleteFocusSession();

  const handleDelete = (id: string) => {
    del.mutate(id, {
      onSuccess: () => toast.success("Session deleted"),
      onError: () => toast.error("Failed to delete session"),
    });
  };

  const totalHours =
    stats ? (stats.total_minutes / 60).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="size-5" />
          Focus Mode
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Deep work sessions — one thing at a time.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatsRow label="Sessions" value={stats.total_sessions} icon={CheckCircle2} />
          <StatsRow label="Hours" value={totalHours} icon={Clock} />
          <StatsRow label="Streak" value={`${stats.current_streak}d`} icon={Flame} />
          <StatsRow label="Best streak" value={`${stats.longest_streak}d`} icon={BarChart2} />
        </div>
      )}

      {/* Active / Start */}
      {loadingActive ? (
        <div className="h-48 rounded-2xl border border-border bg-card animate-pulse" />
      ) : active ? (
        <ActiveSession session={active} />
      ) : (
        <StartSession />
      )}

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Session history</h3>
        {loadingHistory ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : (history?.data?.length ?? 0) === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 py-12 rounded-xl border border-border bg-card text-muted-foreground",
              active && "opacity-50"
            )}
          >
            <Brain className="size-7" />
            <p className="text-sm">No completed sessions yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {history!.data.map((s) => (
              <HistoryItem key={s.id} session={s} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
