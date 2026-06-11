"use client";
import { useState, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useAdminTasks, useAdminUsers } from "@/lib/admin-hooks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Users, ClipboardList, CheckCircle2, Clock, Circle, ShieldCheck } from "lucide-react";

const statusConfig = {
  todo: { label: "Todo", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  done: { label: "Done", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const priorityConfig = {
  low: { label: "Low", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/8" },
  medium: { label: "Medium", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/8" },
  high: { label: "High", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/8" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = statusConfig[status as keyof typeof statusConfig];
  if (!cfg) return <span className="text-xs text-muted-foreground capitalize">{status}</span>;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const cfg = priorityConfig[priority as keyof typeof priorityConfig];
  if (!cfg) return <span className="text-xs text-muted-foreground capitalize">{priority}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", cfg.text, cfg.bg)}>
      <span className={cn("size-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

const statusFilters = [
  { value: "all", label: "All" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

function AllTasksTab() {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(val), 350);
  };

  const { data, isLoading } = useAdminTasks({
    limit: 100,
    status: status === "all" ? undefined : status,
    search: searchQuery || undefined,
  });

  const tasks = data?.data ?? [];
  const total = data?.total ?? 0;

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const highPriorityTasks = tasks.filter((t) => t.priority === "high").length;

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total tasks", value: total, icon: ClipboardList, color: "text-foreground" },
          { label: "Done", value: doneTasks, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "In progress", value: inProgressTasks, icon: Clock, color: "text-blue-500" },
          { label: "High priority", value: highPriorityTasks, icon: Circle, color: "text-rose-500" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3 animate-in fade-in-0 slide-in-from-bottom-3 duration-400"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <s.icon className={cn("size-4 shrink-0", s.color)} />
            <div>
              <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
              <p className="text-lg font-semibold leading-tight">{isLoading ? "—" : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center animate-in fade-in-0 slide-in-from-bottom-2 duration-400 stagger-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 w-52"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150",
                status === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-border bg-card">
          <ClipboardList className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No tasks match your filters</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-400 stagger-3">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Title</TableHead>
                <TableHead className="w-40">User</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-28">Priority</TableHead>
                <TableHead className="w-32">Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task, i) => (
                <TableRow
                  key={task.id}
                  className="group animate-in fade-in-0 duration-300"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <TableCell>
                    <span className={cn("font-medium text-sm", task.status === "done" && "line-through text-muted-foreground")}>
                      {task.title}
                    </span>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{task.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground font-mono">{task.user_email}</span>
                  </TableCell>
                  <TableCell><StatusPill status={task.status} /></TableCell>
                  <TableCell><PriorityPill priority={task.priority} /></TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {task.due_date ? format(new Date(task.due_date), "MMM d, yyyy") : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const { data: users, isLoading } = useAdminUsers();
  const list = users ?? [];

  const admins = list.filter((u) => u.role === "admin").length;
  const totalTasks = list.reduce((sum, u) => sum + u.task_count, 0);

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total users", value: list.length, icon: Users, color: "text-foreground" },
          { label: "Admins", value: admins, icon: ShieldCheck, color: "text-primary" },
          { label: "Total tasks", value: totalTasks, icon: ClipboardList, color: "text-blue-500" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3 animate-in fade-in-0 slide-in-from-bottom-3 duration-400"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <s.icon className={cn("size-4 shrink-0", s.color)} />
            <div>
              <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
              <p className="text-lg font-semibold leading-tight">{isLoading ? "—" : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-border bg-card">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-400 stagger-3">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Email</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-20">Tasks</TableHead>
                <TableHead className="w-36">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u, i) => (
                <TableRow
                  key={u.id}
                  className="animate-in fade-in-0 duration-300"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold shrink-0 select-none">
                        {u.email.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                        u.role === "admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {u.role === "admin" && <ShieldCheck className="size-2.5" />}
                      {u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{u.task_count}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(u.created_at), "MMM d, yyyy")}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-400 stagger-1">
        <h2 className="text-xl font-bold tracking-tight">Admin Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Overview of all users and tasks</p>
      </div>
      <Tabs defaultValue="tasks">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="tasks" className="rounded-lg text-xs">
            <ClipboardList className="size-3.5 mr-1.5" />
            All Tasks
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg text-xs">
            <Users className="size-3.5 mr-1.5" />
            Users
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <AllTasksTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
