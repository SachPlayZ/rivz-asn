"use client";
import { useState } from "react";
import { type Task, useUpdateTask, useDeleteTask } from "@/lib/tasks-hooks";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TaskForm } from "./TaskForm";

const statusConfig = {
  todo: {
    label: "Todo",
    className: "bg-muted text-muted-foreground",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  done: {
    label: "Done",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

const priorityConfig = {
  low: {
    label: "Low",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/8",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/8",
  },
  high: {
    label: "High",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/8",
  },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

type TaskRowProps = { task: Task };

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

  const status = statusConfig[task.status];
  const priority = priorityConfig[task.priority];
  const overdue = isOverdue(task.due_date);
  const isDone = task.status === "done";

  return (
    <>
      {/* Desktop row */}
      <TableRow className="hidden md:table-row group transition-colors">
        <TableCell className="w-8">
          <input
            type="checkbox"
            checked={isDone}
            onChange={handleToggleDone}
            className="size-4 rounded border-input accent-primary cursor-pointer"
            aria-label={`Mark "${task.title}" as ${isDone ? "not done" : "done"}`}
          />
        </TableCell>

        <TableCell>
          <span
            className={cn(
              "font-medium text-sm",
              isDone && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </span>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
              {task.description}
            </p>
          )}
        </TableCell>

        <TableCell className="w-28">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              status.className
            )}
          >
            {status.label}
          </span>
        </TableCell>

        <TableCell className="w-24">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              priority.text,
              priority.bg
            )}
          >
            <span className={cn("size-1.5 rounded-full flex-shrink-0", priority.dot)} />
            {priority.label}
          </span>
        </TableCell>

        <TableCell className="w-36">
          {task.due_date ? (
            <span
              className={cn(
                "text-xs",
                overdue && !isDone
                  ? "text-rose-600 dark:text-rose-400 font-medium"
                  : "text-muted-foreground"
              )}
            >
              {formatDate(task.due_date)}
              {overdue && !isDone && (
                <span className="ml-1 opacity-70">· overdue</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>

        <TableCell className="w-28 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditOpen(true)}
              aria-label="Edit task"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
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
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Mobile card */}
      <div className="md:hidden bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isDone}
            onChange={handleToggleDone}
            className="mt-0.5 size-4 rounded border-input accent-primary cursor-pointer flex-shrink-0"
            aria-label={`Mark "${task.title}" as ${isDone ? "not done" : "done"}`}
          />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-medium text-sm",
                isDone && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditOpen(true)}
              aria-label="Edit task"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              status.className
            )}
          >
            {status.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              priority.text,
              priority.bg
            )}
          >
            <span className={cn("size-1.5 rounded-full flex-shrink-0", priority.dot)} />
            {priority.label}
          </span>
          {task.due_date && (
            <span
              className={cn(
                "text-xs",
                overdue && !isDone
                  ? "text-rose-600 dark:text-rose-400 font-medium"
                  : "text-muted-foreground"
              )}
            >
              Due {formatDate(task.due_date)}
              {overdue && !isDone && " · overdue"}
            </span>
          )}
        </div>

        {confirmDelete && (
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <p className="text-xs text-muted-foreground flex-1">Delete this task?</p>
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
