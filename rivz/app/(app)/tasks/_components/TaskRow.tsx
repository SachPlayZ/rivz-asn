"use client";
import { useState } from "react";
import { type Task, useUpdateTask, useDeleteTask } from "@/lib/tasks-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TaskForm } from "./TaskForm";

const priorityConfig = {
  low: { label: "Low", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  high: { label: "High", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

const statusConfig = {
  todo: { label: "Todo" },
  in_progress: { label: "In Progress" },
  done: { label: "Done" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

type TaskRowProps = {
  task: Task;
};

export function TaskRow({ task }: TaskRowProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleToggleDone = async () => {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask.mutateAsync({ id: task.id, status: newStatus });
    } catch {
      toast.error("Failed to update task");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask.mutateAsync(task.id);
      toast.success("Task deleted");
      setConfirmDelete(false);
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const priority = priorityConfig[task.priority];
  const status = statusConfig[task.status];
  const overdue = isOverdue(task.due_date);

  return (
    <>
      {/* Desktop row */}
      <TableRow className="hidden md:table-row">
        <TableCell className="w-8">
          <input
            type="checkbox"
            checked={task.status === "done"}
            onChange={handleToggleDone}
            className="size-4 rounded border-border accent-primary cursor-pointer"
            aria-label={`Mark "${task.title}" as ${task.status === "done" ? "not done" : "done"}`}
          />
        </TableCell>
        <TableCell>
          <span className={cn("font-medium", task.status === "done" && "line-through text-muted-foreground")}>
            {task.title}
          </span>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate max-w-xs">{task.description}</p>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{status.label}</Badge>
        </TableCell>
        <TableCell>
          <Badge className={priority.className} variant="outline">
            {priority.label}
          </Badge>
        </TableCell>
        <TableCell>
          {task.due_date ? (
            <span className={cn("text-sm", overdue && task.status !== "done" && "text-destructive font-medium")}>
              {formatDate(task.due_date)}
              {overdue && task.status !== "done" && " (overdue)"}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditOpen(true)}
              aria-label="Edit task"
            >
              <Pencil />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteTask.isPending}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete task"
              >
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Mobile card */}
      <div className="md:hidden border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={task.status === "done"}
            onChange={handleToggleDone}
            className="mt-0.5 size-4 rounded border-border accent-primary cursor-pointer"
            aria-label={`Mark "${task.title}" as ${task.status === "done" ? "not done" : "done"}`}
          />
          <div className="flex-1 min-w-0">
            <p className={cn("font-medium text-sm", task.status === "done" && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditOpen(true)}
              aria-label="Edit task"
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete task"
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{status.label}</Badge>
          <Badge className={priority.className} variant="outline">
            {priority.label}
          </Badge>
          {task.due_date && (
            <span className={cn("text-xs", overdue && task.status !== "done" && "text-destructive font-medium")}>
              Due {formatDate(task.due_date)}
              {overdue && task.status !== "done" && " (overdue)"}
            </span>
          )}
        </div>
        {confirmDelete && (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteTask.isPending}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <TaskForm open={editOpen} onOpenChange={setEditOpen} task={task} />
    </>
  );
}
