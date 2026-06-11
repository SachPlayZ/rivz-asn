"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
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
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskRow } from "./TaskRow";
import { TaskForm } from "./TaskForm";
import { Pagination } from "./Pagination";
import { Plus, Search, ClipboardList, ArrowUpDown } from "lucide-react";

const PAGE_LIMIT = 10;

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

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
      <div className="flex items-center justify-between">
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
      <div className="flex flex-wrap gap-2 items-center">
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

        {/* Status filter */}
        <Select
          value={status || "all"}
          onValueChange={(val) =>
            updateParams({ status: val === "all" ? undefined : val })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="todo">Todo</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sort}
          onValueChange={(val) => updateParams({ sort: val })}
        >
          <SelectTrigger className="w-40">
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
        <Button variant="outline" size="sm" onClick={handleToggleOrder}>
          <ArrowUpDown className="w-3.5 h-3.5" />
          {order === "asc" ? "Ascending" : "Descending"}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
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
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">Priority</TableHead>
                  <TableHead className="w-36">Due Date</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {!isLoading && total > PAGE_LIMIT && (
        <Pagination page={page} total={total} limit={PAGE_LIMIT} />
      )}

      <TaskForm open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  );
}
