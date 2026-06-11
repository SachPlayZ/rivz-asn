"use client";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useGlobalActivity, type ActivityLogWithTask } from "@/lib/activity-hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Tag,
  AlignLeft,
  Calendar,
  BarChart2,
  Activity,
  ChevronDown,
} from "lucide-react";

type FilterKey =
  | "all"
  | "created"
  | "deleted"
  | "status"
  | "title"
  | "description"
  | "priority"
  | "due_date";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "due_date", label: "Due Date" },
  { key: "deleted", label: "Deleted" },
];

function matchesFilter(log: ActivityLogWithTask, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "created") return log.action === "created";
  if (filter === "deleted") return log.action === "deleted";
  if (log.action === "updated" && log.changes) {
    const keys = Object.keys(log.changes);
    return keys.includes(filter);
  }
  return false;
}

const actionIcon: Record<string, React.ReactNode> = {
  created: <Plus className="size-3" />,
  updated: <Pencil className="size-3" />,
  deleted: <Trash2 className="size-3" />,
};

const changeIcon: Record<string, React.ReactNode> = {
  status: <CheckCircle2 className="size-3 shrink-0" />,
  title: <Tag className="size-3 shrink-0" />,
  description: <AlignLeft className="size-3 shrink-0" />,
  priority: <BarChart2 className="size-3 shrink-0" />,
  due_date: <Calendar className="size-3 shrink-0" />,
};

const actionColors: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  deleted: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const actionDotColors: Record<string, string> = {
  created: "bg-emerald-500",
  updated: "bg-blue-500",
  deleted: "bg-rose-500",
};

function friendlyField(key: string): string {
  const map: Record<string, string> = {
    status: "status",
    title: "title",
    description: "description",
    priority: "priority",
    due_date: "due date",
  };
  return map[key] ?? key;
}

function formatVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "none";
  if (typeof val === "string") {
    if (val.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return new Date(val).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return val.replace(/_/g, " ");
  }
  return String(val);
}

function ChangeList({ changes }: { changes: Record<string, unknown> | null }) {
  if (!changes) return null;
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {entries.map(([key, val]) => {
        const pair = val as [unknown, unknown];
        return (
          <li key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {changeIcon[key] ?? <Pencil className="size-3 shrink-0" />}
            <span className="font-medium text-foreground/70">{friendlyField(key)}:</span>
            <span>{formatVal(pair[0])}</span>
            <ArrowRight className="size-2.5 shrink-0 opacity-50" />
            <span className="font-medium text-foreground/80">{formatVal(pair[1])}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityEntry({ log, index }: { log: ActivityLogWithTask; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = log.changes && Object.keys(log.changes).length > 0;
  const isDeleted = log.action === "deleted";

  return (
    <div
      className="group relative flex gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors duration-150 animate-in fade-in-0 slide-in-from-right-3 duration-300"
      style={{ animationDelay: `${Math.min(index * 35, 400)}ms` }}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <div
          className={cn(
            "flex size-5 items-center justify-center rounded-full shrink-0",
            actionColors[log.action] ?? "bg-muted text-muted-foreground"
          )}
        >
          {actionIcon[log.action]}
        </div>
        <div className={cn("w-px flex-1 min-h-[8px]", actionDotColors[log.action] ?? "bg-border", "opacity-10")} />
      </div>

      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-medium truncate leading-tight", isDeleted && "line-through text-muted-foreground")}>
            {log.task_title}
          </p>
          <time className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
          </time>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
          {log.action === "updated" && hasChanges
            ? `Updated ${Object.keys(log.changes!).map(friendlyField).join(", ")}`
            : log.action}
        </p>

        {log.action === "updated" && hasChanges && (
          <button
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown className={cn("size-2.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} changes
          </button>
        )}

        {expanded && <ChangeList changes={log.changes} />}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ActivitySidebar({ open, onClose }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const { data: logs = [], isLoading } = useGlobalActivity(open);

  const filtered = useMemo(
    () => logs.filter((l) => matchesFilter(l, filter)),
    [logs, filter]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-background/95 backdrop-blur-xl border-l border-border shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Activity log"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Activity</h2>
            {logs.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {logs.length}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close activity panel">
            <X className="size-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 overflow-x-auto px-4 py-2.5 border-b border-border scrollbar-none animate-in fade-in-0 slide-in-from-top-2 duration-300" style={{ animationDelay: "80ms" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150",
                filter === f.key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="flex flex-col gap-2 px-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <div className="size-5 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="h-3.5 w-3/4 rounded-md bg-muted animate-pulse" />
                    <div className="h-2.5 w-1/2 rounded-md bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <Activity className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filter === "all"
                    ? "Create or update tasks to see activity here"
                    : "No events match this filter"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map((log, i) => (
                <ActivityEntry key={log.id} log={log} index={i} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
