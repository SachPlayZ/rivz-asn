"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useRef } from "react";
import { useTasks } from "@/lib/tasks-hooks";
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
import { Plus, Search, ClipboardList, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 10;

const statusFilters = [
  { value: "all", label: "All" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export function TasksPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "created_at";
  const order = searchParams.get("order") ?? "desc";
  const page = Number(searchParams.get("page") ?? "1");

  const [searchInput, setSearchInput] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (prevSearch !== search) {
    setPrevSearch(search);
    setSearchInput(search);
  }

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

  const { data, isLoading } = useTasks({
    status: status || undefined,
    search: search || undefined,
    sort,
    order,
    page,
    limit: PAGE_LIMIT,
  });

  const tasks = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between animate-in fade-in-0 slide-in-from-bottom-3 duration-400 stagger-1">
        <div>
          <h2 className="text-xl font-bold tracking-tight">My Tasks</h2>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} {total === 1 ? "task" : "tasks"}
            </p>
          )}
        </div>
        <Button onClick={() => setNewTaskOpen(true)} size="sm">
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center animate-in fade-in-0 slide-in-from-bottom-3 duration-400 stagger-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 w-52"
          />
        </div>

        {/* Status filter — pill tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {statusFilters.map((f) => {
            const active = (status || "all") === f.value;
            return (
              <button
                key={f.value}
                onClick={() => updateParams({ status: f.value === "all" ? undefined : f.value })}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <Select
          value={sort}
          onValueChange={(val) => updateParams({ sort: val })}
        >
          <SelectTrigger className="w-36 text-xs h-7">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="created_at">Created date</SelectItem>
              <SelectItem value="due_date">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Order toggle */}
        <Button variant="outline" size="sm" onClick={handleToggleOrder} className="h-7 text-xs gap-1">
          {order === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )}
          {order === "asc" ? "Asc" : "Desc"}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
            <ClipboardList className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">No tasks found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || status
                ? "Try adjusting your filters"
                : "Create your first task to get started"}
            </p>
          </div>
          {!search && !status && (
            <Button onClick={() => setNewTaskOpen(true)} size="sm">
              <Plus className="w-4 h-4" />
              Create your first task
            </Button>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 stagger-3">
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-28">Priority</TableHead>
                  <TableHead className="w-36">Due Date</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task, i) => (
                  <TaskRow key={task.id} task={task} index={i} search={search} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2">
            {tasks.map((task, i) => (
              <TaskRow key={task.id} task={task} index={i} search={search} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > PAGE_LIMIT && (
        <Pagination page={page} total={total} limit={PAGE_LIMIT} />
      )}

      <TaskForm open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  );
}
