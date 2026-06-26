"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isBefore, isAfter, parseISO } from "date-fns";
import { useTasks, useBulkUpdateTasks, useBulkDeleteTasks, useUpdateTask } from "@/lib/tasks-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskRow } from "./TaskRow";
import { TaskForm } from "./TaskForm";
import { Pagination } from "./Pagination";
import { KanbanView } from "./KanbanView";
import { GanttView } from "./GanttView";
import { CalendarView, getCalendarRange } from "./CalendarView";
import { WeeklyPlanner } from "./WeeklyPlanner";
import { ViewToggle } from "./ViewToggle";
import type { View as DisplayViewType } from "./ViewToggle";
import {
  Plus, Search, ClipboardList, ArrowUp, ArrowDown, X,
  Inbox, Sun, Calendar, AlertCircle, CalendarClock, Focus,
  CheckCircle2, ChevronRight, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSavedFilters, useCreateSavedFilter, useDeleteSavedFilter, type SavedFilter } from "@/lib/savedfilters-hooks";
import Link from "next/link";

const PAGE_LIMIT = 10;
const SMART_LIMIT = 200;

type SmartList = "all" | "inbox" | "today" | "upcoming" | "overdue";
type DisplayView = DisplayViewType;

const SMART_NAV = [
  { id: "inbox",    label: "Inbox",     icon: <Inbox className="size-4" />,          desc: "No unscheduled tasks." },
  { id: "today",    label: "Today",     icon: <Sun className="size-4 text-amber-500" />,    desc: "Nothing due today — you're all caught up!" },
  { id: "upcoming", label: "Upcoming",  icon: <Calendar className="size-4 text-blue-500" />, desc: "Nothing coming up in the next 7 days." },
  { id: "overdue",  label: "Overdue",   icon: <AlertCircle className="size-4 text-rose-500" />, desc: "No overdue tasks — great work!" },
  { id: "all",      label: "All Tasks", icon: <ClipboardList className="size-4" />,   desc: "No tasks found." },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

export function TasksPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState<string | undefined>();
  const [calendarRange, setCalendarRange] = useState<{ from: string; to: string }>(
    () => getCalendarRange(new Date())
  );
  const handleCalendarRangeChange = useCallback((from: string, to: string) => {
    setCalendarRange(prev => prev.from === from && prev.to === to ? prev : { from, to });
  }, []);

  const [weeklyRange, setWeeklyRange] = useState<{ from: string; to: string }>(() => {
    const now = new Date();
    return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
  });
  const handleWeeklyRangeChange = useCallback((from: string, to: string) => {
    setWeeklyRange(prev => prev.from === from && prev.to === to ? prev : { from, to });
  }, []);

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "created_at";
  const order = searchParams.get("order") ?? "desc";
  const page = Number(searchParams.get("page") ?? "1");
  const list = (searchParams.get("list") ?? "all") as SmartList;

  const [searchInput, setSearchInput] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [focusMode, setFocusMode] = useState(false);

  // Display view (table/kanban/gantt/weekly) in localStorage
  const [displayView, setDisplayView] = useState<DisplayView>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("task-view") as DisplayView) ?? "table";
    }
    return "table";
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkUpdate = useBulkUpdateTasks();
  const updateTask = useUpdateTask();
  const bulkDelete = useBulkDeleteTasks();

  // Saved Filters hooks
  const { data: savedFilters = [] } = useSavedFilters();
  const createSavedFilter = useCreateSavedFilter();
  const deleteSavedFilter = useDeleteSavedFilter();

  const handleSaveCurrentFilter = () => {
    const namePrompt = prompt("Enter a name for this saved filter:", "My Filter");
    if (!namePrompt?.trim()) return;

    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== "page" && key !== "new") {
        params[key] = value;
      }
    });

    createSavedFilter.mutate({
      name: namePrompt.trim(),
      params,
    }, {
      onSuccess: () => toast.success(`Saved filter "${namePrompt}"`),
      onError: () => toast.error("Failed to save filter"),
    });
  };

  const handleApplySavedFilter = (filter: SavedFilter) => {
    const params = new URLSearchParams();
    Object.entries(filter.params).forEach(([key, val]) => {
      params.set(key, val);
    });
    router.push(`${pathname}?${params.toString()}`);
    toast.success(`Applied filter "${filter.name}"`);
  };

  if (prevSearch !== search) {
    setPrevSearch(search);
    setSearchInput(search);
  }

  // Open new task from URL param ?new=1
  const newParam = searchParams.get("new");
  useEffect(() => {
    if (newParam === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewTaskOpen(true);
      const p = new URLSearchParams(searchParams.toString());
      p.delete("new");
      router.replace(`${pathname}?${p.toString()}`);
    }
  }, [newParam, pathname, router, searchParams]);

  const updateParams = (updates: Record<string, string | undefined | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    if (!("page" in updates)) params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const setList = (l: SmartList) => {
    const params = new URLSearchParams(searchParams.toString());
    if (l === "all") params.delete("list");
    else params.set("list", l);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value || undefined });
    }, 400);
  };

  const handleToggleOrder = () => {
    updateParams({ order: order === "asc" ? "desc" : "asc" });
  };

  const handleDisplayViewChange = (v: DisplayView) => {
    setDisplayView(v);
    localStorage.setItem("task-view", v);
  };

  const isSmartView = list !== "all";
  const isFocused = focusMode;
  const isCalendarView = displayView === "calendar" && list === "all";
  const isKanbanView = displayView === "kanban" && list === "all";
  const isWeeklyView = displayView === "weekly" && list === "all";
  const isRangedView = isCalendarView || isKanbanView || isWeeklyView;
  const fetchLimit = isSmartView || isFocused ? SMART_LIMIT : isRangedView ? 500 : PAGE_LIMIT;

  const kanbanRange = useMemo(() => {
    const now = new Date();
    return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
  }, []);

  const activeRange = isCalendarView ? calendarRange : isKanbanView ? kanbanRange : isWeeklyView ? weeklyRange : null;

  const { data, isLoading } = useTasks({
    status: status || undefined,
    search: search || undefined,
    sort,
    order,
    page: isSmartView || isFocused || isRangedView ? 1 : page,
    limit: fetchLimit,
    ...(activeRange ? { due_date_from: activeRange.from, due_date_to: activeRange.to } : {}),
  });

  const today = startOfDay(new Date());
  const nextWeek = addDays(today, 7);

  const STATUS_ORDER: Record<string, number> = { in_progress: 0, todo: 1, done: 2, failed: 3 };

  const displayTasks = useMemo(() => {
    const all = data?.data ?? [];
    let filtered: typeof all;
    if (focusMode) {
      filtered = all.filter(
        (t) =>
          (t.due_date && isSameDay(parseISO(t.due_date), today)) ||
          t.status === "in_progress"
      );
    } else {
      switch (list) {
        case "inbox":
          filtered = all.filter((t) => !t.due_date);
          break;
        case "today":
          filtered = all.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), today));
          break;
        case "upcoming":
          filtered = all.filter(
            (t) =>
              t.due_date &&
              isAfter(parseISO(t.due_date), today) &&
              isBefore(parseISO(t.due_date), nextWeek)
          );
          break;
        case "overdue":
          filtered = all.filter(
            (t) =>
              t.due_date &&
              isBefore(parseISO(t.due_date), today) &&
              t.status !== "done"
          );
          break;
        default:
          filtered = all;
      }
    }
    if (sort === "sort_order") {
      return [...filtered];
    }
    return [...filtered].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, focusMode, list, sort]);

  const displayTotal = isSmartView || isFocused ? displayTasks.length : (data?.total ?? 0);

  // Keyboard shortcuts (/ to search, Esc to exit focus)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return;
    if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    if (e.key === "Escape") setFocusMode(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSelectChange = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(displayTasks.map((t) => t.id)) : new Set());
  };

  const handleBulkStatus = async (s: string) => {
    await bulkUpdate.mutateAsync({ ids: [...selected], status: s });
    setSelected(new Set());
    toast.success(`${selected.size} tasks updated`);
  };

  const handleBulkDelete = async () => {
    await bulkDelete.mutateAsync([...selected]);
    setSelected(new Set());
    toast.success(`${selected.size} tasks deleted`);
  };

  const currentSmartNav = SMART_NAV.find((n) => n.id === list) ?? SMART_NAV[4];
  const emptyDesc = currentSmartNav.desc;

  // Focus mode overlay
  if (focusMode) {
    return (
      <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Focus className="size-4 text-primary" />
            <span className="font-semibold text-sm">Focus Mode</span>
            <span className="text-xs text-muted-foreground ml-2">
              {displayTasks.length} task{displayTasks.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFocusMode(false)} className="text-xs gap-1.5">
            <X className="size-3.5" />
            Exit <span className="text-muted-foreground">(Esc)</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-6 py-8">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : displayTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <p className="font-semibold text-lg">All clear!</p>
              <p className="text-sm text-muted-foreground">No tasks due today or in progress.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {displayTasks.map((task, i) => (
                <li
                  key={task.id}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer group animate-in fade-in-0 slide-in-from-bottom-1"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                >
                  <div className={cn(
                    "size-2.5 rounded-full shrink-0",
                    task.priority === "high" ? "bg-rose-500" : task.priority === "medium" ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                  <span className={cn(
                    "flex-1 font-medium",
                    task.status === "done" && "line-through text-muted-foreground"
                  )}>
                    {task.title}
                  </span>
                  {task.status === "in_progress" && (
                    <span className="text-xs text-blue-500 font-medium shrink-0">In progress</span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground pb-4">Press Esc to exit focus mode</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Smart list sidebar — lg+ only */}
      <aside className="hidden lg:flex flex-col gap-0.5 w-40 shrink-0 pt-0.5">
        {SMART_NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setList(item.id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left",
              list === item.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="mt-2 pt-2 border-t border-border">
          <Link
            href="/tasks/review"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 w-full"
          >
            <CalendarClock className="size-4 text-violet-500" />
            Daily review
          </Link>
        </div>

        <div className="mt-2 pt-2 border-t border-border flex flex-col gap-1">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
              <Filter className="size-3" /> Filters
            </span>
            <button
              onClick={handleSaveCurrentFilter}
              className="text-muted-foreground hover:text-foreground text-[10px] font-bold leading-none shrink-0"
              title="Save current active filter settings"
            >
              + Save
            </button>
          </div>
          {savedFilters.length === 0 ? (
            <p className="text-[10px] text-muted-foreground px-3 py-1 italic">None saved</p>
          ) : (
            savedFilters.map((sf) => (
              <div key={sf.id} className="group flex items-center justify-between w-full rounded-lg hover:bg-muted/40 transition-colors pr-1.5">
                <button
                  onClick={() => handleApplySavedFilter(sf)}
                  className="flex-1 text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground truncate"
                  title={`Apply filter "${sf.name}"`}
                >
                  {sf.name}
                </button>
                <button
                  onClick={() => {
                    deleteSavedFilter.mutate(sf.id, {
                      onSuccess: () => toast.success("Saved filter deleted"),
                    });
                  }}
                  className="size-5 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete this saved filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* Mobile smart list pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden -mx-1 px-1">
          {SMART_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setList(item.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all",
                list === item.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <Link
            href="/tasks/review"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-border text-muted-foreground hover:text-foreground transition-all"
          >
            <CalendarClock className="size-3.5 text-violet-500" />
            Daily review
          </Link>
        </div>

        {/* Page header */}
        <div className="flex items-center justify-between animate-in fade-in-0 slide-in-from-bottom-3 duration-400">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {list === "all" ? "My Tasks" : currentSmartNav.label}
            </h2>
            {!isLoading && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {displayTotal} {displayTotal === 1 ? "task" : "tasks"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFocusMode(true)}
              aria-label="Focus mode"
              title="Focus mode"
              className="text-muted-foreground hover:text-foreground"
            >
              <Focus className="size-4" />
            </Button>
            <Button onClick={() => setNewTaskOpen(true)} size="sm">
              <Plus className="w-4 h-4" />
              New Task
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center animate-in fade-in-0 slide-in-from-bottom-3 duration-400">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search tasks…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 w-48"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            {STATUS_FILTERS.map((f) => {
              const active = (status || "all") === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => updateParams({ status: f.value === "all" ? undefined : f.value })}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <Select value={sort} onValueChange={(val) => updateParams({ sort: val })}>
            <SelectTrigger className="w-36 text-xs h-7">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="created_at">Created date</SelectItem>
                <SelectItem value="due_date">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="sort_order">Custom order</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleToggleOrder} className="h-7 text-xs gap-1">
            {order === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {order === "asc" ? "Asc" : "Desc"}
          </Button>

          {list === "all" && <ViewToggle view={displayView} onChange={handleDisplayViewChange} />}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
              {list === "overdue" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              ) : (
                <ClipboardList className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-semibold">
                {list === "overdue" ? "All caught up!" : "Nothing here"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{emptyDesc}</p>
            </div>
            {list === "all" && !search && !status && (
              <Button onClick={() => setNewTaskOpen(true)} size="sm">
                <Plus className="w-4 h-4" />
                Create your first task
              </Button>
            )}
          </div>
        ) : displayView === "kanban" && list === "all" ? (
          <KanbanView tasks={displayTasks} />
        ) : displayView === "gantt" && list === "all" ? (
          <GanttView
            tasks={displayTasks}
            onTaskClick={(task) => router.push(`/tasks/${task.id}`)}
          />
        ) : displayView === "weekly" && list === "all" ? (
          <WeeklyPlanner
            tasks={displayTasks}
            onTaskClick={(task) => router.push(`/tasks/${task.id}`)}
            onUpdateDueDate={(taskId, date) => {
              updateTask.mutate(
                { id: taskId, due_date: new Date(date + "T12:00:00").toISOString() },
                {
                  onSuccess: () => toast.success("Rescheduled"),
                  onError: () => toast.error("Failed to reschedule"),
                }
              );
            }}
            onRangeChange={handleWeeklyRangeChange}
          />
        ) : displayView === "calendar" && list === "all" ? (
          <CalendarView
            tasks={displayTasks}
            onTaskClick={(task) => router.push(`/tasks/${task.id}`)}
            onReschedule={(taskId, date) => {
              updateTask.mutate(
                { id: taskId, due_date: new Date(date + "T12:00:00").toISOString() },
                {
                  onSuccess: () => toast.success("Rescheduled"),
                  onError: () => toast.error("Failed to reschedule"),
                }
              );
            }}
            onNewTask={(date) => {
              setNewTaskDate(date);
              setNewTaskOpen(true);
            }}
            onRangeChange={handleCalendarRangeChange}
          />
        ) : (
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === displayTasks.length && displayTasks.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="size-4 rounded border-input accent-primary cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="max-w-[200px] lg:max-w-[320px] xl:max-w-[400px]">Title</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24">Priority</TableHead>
                    <TableHead className="w-36">Due Date</TableHead>
                    <TableHead className="w-36 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayTasks.map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      index={i}
                      search={search}
                      selected={selected.has(task.id)}
                      onSelectChange={handleSelectChange}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden flex flex-col gap-2">
              {displayTasks.map((task, i) => (
                <TaskRow key={task.id} task={task} index={i} search={search} />
              ))}
            </div>
          </div>
        )}

        {/* Pagination — only in "all" non-smart, non-calendar view */}
        {!isLoading && !isSmartView && !isRangedView && data && data.total > PAGE_LIMIT && (
          <Pagination page={page} total={data.total} limit={PAGE_LIMIT} />
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border rounded-xl shadow-2xl px-4 py-2.5 animate-in slide-in-from-bottom-3">
            <span className="text-sm font-medium whitespace-nowrap">{selected.size} selected</span>
            <Select onValueChange={handleBulkStatus}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="Set status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="todo">Todo</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select onValueChange={(p) => bulkUpdate.mutateAsync({ ids: [...selected], priority: p }).then(() => { setSelected(new Set()); toast.success(`${selected.size} updated`); })}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="Set priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleBulkDelete}>Delete</Button>
            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => setSelected(new Set())}>
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        <TaskForm
          open={newTaskOpen}
          onOpenChange={(o) => {
            setNewTaskOpen(o);
            if (!o) setNewTaskDate(undefined);
          }}
          defaultDate={newTaskDate}
        />
      </div>
    </div>
  );
}
