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
import { Plus, ArrowUpDown, ClipboardList } from "lucide-react";

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

  // Debounced search
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
    // Reset to page 1 on filter change (unless explicitly setting page)
    if (!("page" in updates)) {
      params.set("page", "1");
    }
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tasks</h2>
          {!isLoading && (
            <p className="text-sm text-muted-foreground">{total} total</p>
          )}
        </div>
        <Button onClick={() => setNewTaskOpen(true)}>
          <Plus data-icon="inline-start" />
          New Task
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
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

        {/* Search */}
        <Input
          placeholder="Search tasks..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-52"
        />

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
          <ArrowUpDown data-icon="inline-start" />
          {order === "asc" ? "Ascending" : "Descending"}
        </Button>
      </div>

      {/* Table (desktop) + Cards (mobile) */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <ClipboardList className="size-12 text-muted-foreground" />
          <div>
            <p className="font-medium">No tasks found</p>
            <p className="text-sm text-muted-foreground">
              {search || status
                ? "Try adjusting your filters"
                : "Create your first task to get started"}
            </p>
          </div>
          {!search && !status && (
            <Button onClick={() => setNewTaskOpen(true)}>
              <Plus data-icon="inline-start" />
              Create your first task
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">Priority</TableHead>
                  <TableHead className="w-36">Due Date</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
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
          <div className="md:hidden flex flex-col gap-3">
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

      {/* New task form */}
      <TaskForm open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  );
}
