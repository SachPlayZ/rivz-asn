"use client";
import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import Image from "next/image";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type PublicTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: "Todo", className: "bg-muted text-muted-foreground border-muted" },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  done: {
    label: "Done",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  failed: {
    label: "Failed",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
};

const priorityConfig: Record<
  string,
  { label: string; dot: string; className: string }
> = {
  low: {
    label: "Low",
    dot: "bg-emerald-500",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-500",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  high: {
    label: "High",
    dot: "bg-rose-500",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
};

export function SharedTaskClient({ token }: { token: string }) {
  const [task, setTask] = useState<PublicTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}/share/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Task not found" : "Failed to load task");
        return res.json() as Promise<PublicTask>;
      })
      .then((data) => {
        setTask(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const statusCfg = task ? statusConfig[task.status] : null;
  const priorityCfg = task ? priorityConfig[task.priority] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <span className="flex items-center gap-2">
            <Image src="/logo.png" alt="Fayde" width={24} height={24} className="size-6 rounded-md" />
            <span className="font-bold text-sm tracking-tight">Fayde</span>
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading task…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-sm font-medium">{error}</p>
            <p className="text-xs text-muted-foreground">
              This link may have expired or be invalid.
            </p>
          </div>
        ) : task ? (
          <div className="flex flex-col gap-6 animate-in fade-in-0 slide-in-from-bottom-3 duration-400">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {statusCfg && (
                <Badge className={cn("text-xs", statusCfg.className)}>
                  {statusCfg.label}
                </Badge>
              )}
              {priorityCfg && (
                <Badge className={cn("text-xs gap-1.5", priorityCfg.className)}>
                  <span className={cn("size-1.5 rounded-full shrink-0", priorityCfg.dot)} />
                  {priorityCfg.label}
                </Badge>
              )}
              {task.due_date && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Due {format(new Date(task.due_date), "MMM d, yyyy")}</span>
                </div>
              )}
            </div>

            {/* Title */}
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight leading-tight">
                {task.title}
              </h1>
              {task.description && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {task.description}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Shared via{" "}
                <span className="font-semibold text-foreground">Fayde</span> — productivity suite
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
