"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Timer, X, Check, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useActivePomodoro,
  useStartPomodoro,
  useCompletePomodoro,
  useAbandonPomodoro,
} from "@/lib/pomodoro-hooks";
import { useTasks } from "@/lib/tasks-hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BREAK_SECONDS = 5 * 60;

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroTimer() {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<25 | 50>(25);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [breakRemaining, setBreakRemaining] = useState<number | null>(null);

  const { data: activeSession } = useActivePomodoro();
  const { data: todoData } = useTasks({ status: "todo", limit: 200 });
  const { data: inProgressData } = useTasks({ status: "in_progress", limit: 200 });
  const availableTasks = useMemo(
    () => [...(todoData?.data ?? []), ...(inProgressData?.data ?? [])],
    [todoData, inProgressData]
  );
  const activeTaskTitle = useMemo(
    () => activeSession?.task_id ? availableTasks.find((t) => t.id === activeSession.task_id)?.title : null,
    [activeSession, availableTasks]
  );
  const startPomodoro = useStartPomodoro();
  const completePomodoro = useCompletePomodoro();
  const abandonPomodoro = useAbandonPomodoro();

  // Sync countdown from active session
  useEffect(() => {
    if (!activeSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemaining(null);
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - new Date(activeSession.started_at).getTime()) / 1000;
      const total = activeSession.duration_minutes * 60;
      const rem = Math.max(0, Math.ceil(total - elapsed));
      setRemaining(rem);
      return rem;
    };
    const rem = tick();
    if (rem <= 0) return;
    const id = setInterval(() => {
      const r = tick();
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  // Auto-complete when countdown hits 0
  useEffect(() => {
    if (remaining === 0 && activeSession) {
      completePomodoro.mutate(activeSession.id, {
        onSuccess: () => {
          toast.success("Pomodoro complete!");
          setBreakRemaining(BREAK_SECONDS);
        },
      });
    }
  }, [remaining, activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Break countdown
  useEffect(() => {
    if (breakRemaining === null || breakRemaining <= 0) return;
    const id = setInterval(() => {
      setBreakRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [breakRemaining]);

  const handleStart = useCallback(() => {
    startPomodoro.mutate(
      { duration_minutes: duration, task_id: selectedTaskId ?? undefined },
      {
        onSuccess: () => toast.success(`${duration}m pomodoro started`),
        onError: () => toast.error("Failed to start"),
      }
    );
  }, [duration, selectedTaskId, startPomodoro]);

  const handleComplete = useCallback(() => {
    if (!activeSession) return;
    completePomodoro.mutate(activeSession.id, {
      onSuccess: () => {
        toast.success("Session complete!");
        setBreakRemaining(BREAK_SECONDS);
      },
      onError: () => toast.error("Failed to complete"),
    });
  }, [activeSession, completePomodoro]);

  const handleAbandon = useCallback(() => {
    if (!activeSession) return;
    abandonPomodoro.mutate(activeSession.id, {
      onSuccess: () => toast("Session abandoned"),
      onError: () => toast.error("Failed to abandon"),
    });
  }, [activeSession, abandonPomodoro]);

  const totalSeconds = activeSession ? activeSession.duration_minutes * 60 : duration * 60;
  const elapsed = remaining !== null ? totalSeconds - remaining : 0;
  const progress = totalSeconds > 0 ? Math.min(1, elapsed / totalSeconds) : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-64 rounded-xl border border-border bg-background shadow-xl p-4 flex flex-col gap-3 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <Timer className="size-4 text-rose-500" />
              Pomodoro
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={() => setOpen(false)}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Break state */}
          {breakRemaining !== null && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-muted-foreground">Break time! 🎉</p>
              <span className="text-3xl font-mono font-bold text-emerald-500">
                {formatTime(breakRemaining)}
              </span>
            </div>
          )}

          {/* Active session */}
          {!breakRemaining && activeSession && remaining !== null && (
            <div className="flex flex-col gap-3">
              {activeTaskTitle && (
                <p className="text-xs text-muted-foreground truncate">{activeTaskTitle}</p>
              )}
              <div className="flex items-center justify-center">
                <span className="text-4xl font-mono font-bold tabular-nums">
                  {formatTime(remaining)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-1000"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <Badge
                variant="secondary"
                className="w-fit text-[10px] self-center"
              >
                {activeSession.duration_minutes}m session
              </Badge>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={handleAbandon}
                  disabled={abandonPomodoro.isPending}
                >
                  <Square className="size-3 mr-1" />
                  Abandon
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleComplete}
                  disabled={completePomodoro.isPending}
                >
                  <Check className="size-3 mr-1" />
                  Complete
                </Button>
              </div>
            </div>
          )}

          {/* Idle state */}
          {!breakRemaining && !activeSession && (
            <div className="flex flex-col gap-3">
              <Select value={selectedTaskId ?? ""} onValueChange={(v) => setSelectedTaskId(v || null)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Link to task (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1.5">
                {([25, 50] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      "flex-1 rounded-md border text-xs py-1.5 font-medium transition-colors",
                      duration === d
                        ? "border-rose-500 bg-rose-500/10 text-rose-600"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                className="h-8 text-xs bg-rose-500 hover:bg-rose-600 text-white"
                onClick={handleStart}
                disabled={startPomodoro.isPending}
              >
                🍅 Start Pomodoro
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "size-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all hover:scale-105 active:scale-95",
          activeSession
            ? "bg-rose-500 text-white animate-pulse"
            : "bg-background border border-border"
        )}
        aria-label="Toggle Pomodoro timer"
      >
        🍅
      </button>
    </div>
  );
}
