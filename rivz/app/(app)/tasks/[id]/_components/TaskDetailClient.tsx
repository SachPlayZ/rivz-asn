"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { useTask, useUpdateTask, useDeleteTask, useTasks } from "@/lib/tasks-hooks";
import { useTaskActivity } from "@/lib/activity-hooks";
import { useAttachments, useUploadAttachment, useDeleteAttachment } from "@/lib/attachments-hooks";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask, useReorderSubtasks } from "@/lib/subtasks-hooks";
import { useTags, useCreateTag, useAddTagToTask, useRemoveTagFromTask } from "@/lib/tags-hooks";
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from "@/lib/comments-hooks";
import { useTaskDependencies, useAddDependency, useRemoveDependency } from "@/lib/dependencies-hooks";
import { useAdminUsers } from "@/lib/admin-hooks";
import { useAuth } from "@/lib/auth-context";
import { useShareToken, useCreateShareToken, useDeleteShareToken } from "@/lib/sharing-hooks";
import { useWatchers, useWatchStatus, useAddWatcher, useRemoveWatcher } from "@/lib/watchers-hooks";
import { useTimeEntries, useActiveTimeEntry, useStartTimer, useStopTimer, useDeleteTimeEntry, type TimeEntry } from "@/lib/timetracking-hooks";
import { useCustomFieldDefs, useTaskFieldValues, useSetFieldValue } from "@/lib/customfields-hooks";
import { ApiError } from "@/lib/api";
import type { Task } from "@/lib/tasks-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseNLDate, formatNLHint } from "@/lib/nldate";
import {
  ArrowLeft,
  CalendarIcon,
  Paperclip,
  X,
  CheckCircle2,
  Clock,
  Circle,
  XCircle,
  UploadCloud,
  File,
  FileImage,
  FileText,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Link2,
  MessageSquare,
  RefreshCw,
  User,
  AlertTriangle,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Share2,
  Globe,
  Play,
  Square,
  History,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusIcon: Record<string, React.ReactNode> = {
  todo: <Circle className="size-3 text-muted-foreground" />,
  in_progress: <Clock className="size-3 text-blue-500" />,
  done: <CheckCircle2 className="size-3 text-emerald-500" />,
  failed: <XCircle className="size-3 text-rose-500" />,
};

const statusLabel: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  failed: "Failed",
};

const priorityBanner: Record<string, { bar: string; bg: string; badge: string; label: string }> = {
  low:    { bar: "bg-emerald-500", bg: "bg-emerald-500/5 dark:bg-emerald-500/10", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", label: "Low" },
  medium: { bar: "bg-amber-500",   bg: "bg-amber-500/5 dark:bg-amber-500/10",     badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",     label: "Medium" },
  high:   { bar: "bg-rose-500",    bg: "bg-rose-500/5 dark:bg-rose-500/10",       badge: "bg-rose-500/15 text-rose-700 dark:text-rose-400",       label: "High" },
};

const actionBadgeStyle: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  deleted: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const TAG_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6"];

function formatChanges(changes: Record<string, unknown> | null): string {
  if (!changes || Object.keys(changes).length === 0) return "";
  return Object.entries(changes)
    .map(([key, val]) => {
      const pair = val as [unknown, unknown];
      const fmt = (v: unknown) => {
        if (!v || v === "") return "none";
        if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}T/)) {
          return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
        return String(v).replace(/_/g, " ");
      };
      return `${key.replace(/_/g, " ")}: ${fmt(pair[0])} → ${fmt(pair[1])}`;
    })
    .join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ contentType }: { contentType: string }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (contentType.startsWith("image/")) return <FileImage className={cls} />;
  if (contentType.startsWith("video/")) return <FileVideo className={cls} />;
  if (contentType.startsWith("audio/")) return <FileAudio className={cls} />;
  if (contentType === "application/pdf" || contentType.startsWith("text/")) return <FileText className={cls} />;
  if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("compressed")) return <FileArchive className={cls} />;
  if (contentType.includes("javascript") || contentType.includes("json") || contentType.includes("xml")) return <FileCode className={cls} />;
  return <File className={cls} />;
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code class='text-xs bg-muted px-1 rounded'>$1</code>")
    .replace(/\n/g, "<br/>");
}

function SortableSubtaskItem({
  id, title, done, onToggle, onDelete,
}: {
  id: string; title: string; done: boolean; onToggle: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 group py-1.5"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="size-3.5" />
      </span>
      <input type="checkbox" checked={done} onChange={onToggle} className="rounded" />
      <span className={cn("text-sm flex-1", done && "line-through text-muted-foreground")}>{title}</span>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function SidebarRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

function useElapsedTimer(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const calc = () => Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function formatTimeTrackingSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

function ActiveTimeEntryTracker({ entry, onStop }: { entry: TimeEntry; onStop: (note: string) => void }) {
  const elapsed = useElapsedTimer(entry.started_at);
  const [stopNote, setStopNote] = useState(entry.note || "");

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-primary" />
          </span>
          Timer Running
        </div>
        <span className="text-[10px] text-muted-foreground">
          Started {format(new Date(entry.started_at), "h:mm a")}
        </span>
      </div>
      <div className="text-center py-2">
        <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
          {formatTimeTrackingSeconds(elapsed)}
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Update description/note (optional)…"
          value={stopNote}
          onChange={(e) => setStopNote(e.target.value)}
          className="h-8 text-xs flex-1 bg-background"
        />
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => onStop(stopNote)}
        >
          <Square className="size-3.5 fill-current" />
          Stop
        </Button>
      </div>
    </div>
  );
}

function StartTimeEntryTracker({ onStart, isPending }: { onStart: (note: string) => void; isPending: boolean }) {
  const [startNote, setStartNote] = useState("");

  return (
    <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">Start logging time on this task</p>
      <div className="flex gap-2">
        <Input
          placeholder="What are you working on? (optional)…"
          value={startNote}
          onChange={(e) => setStartNote(e.target.value)}
          className="h-8 text-xs flex-1 bg-background"
        />
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => {
            onStart(startNote);
            setStartNote("");
          }}
          disabled={isPending}
        >
          <Play className="size-3.5 fill-current" />
          Start Timer
        </Button>
      </div>
    </div>
  );
}

export function TaskDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data: task, isLoading, error } = useTask(id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [recurrenceEnd, setRecurrenceEnd] = useState<Date | undefined>(undefined);

  // Save indicator
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState("subtasks");
  const [openedTabs, setOpenedTabs] = useState<Set<string>>(new Set(["subtasks"]));

  // UI state
  const [descPreview, setDescPreview] = useState(false);
  const [nlDateInput, setNlDateInput] = useState("");
  const [nlParsed, setNlParsed] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [recEndCalendarOpen, setRecEndCalendarOpen] = useState(false);
  const [tagsPopoverOpen, setTagsPopoverOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [commentBody, setCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [depComboOpen, setDepComboOpen] = useState(false);
  const [depFilter, setDepFilter] = useState("");

  // Sub-resource hooks (always called; enabled tracks which tabs were opened)
  const { data: subtasks = [], isLoading: subtasksLoading } = useSubtasks(id, openedTabs.has("subtasks"));
  const createSubtask = useCreateSubtask(id);
  const updateSubtask = useUpdateSubtask(id);
  const deleteSubtask = useDeleteSubtask(id);
  const reorderSubtasks = useReorderSubtasks(id);

  const { data: allTags = [] } = useTags();
  const createTagMutation = useCreateTag();
  const addTagToTask = useAddTagToTask(id);
  const removeTagFromTask = useRemoveTagFromTask(id);

  const { data: comments = [], isLoading: commentsLoading } = useComments(id, openedTabs.has("comments"));
  const createComment = useCreateComment(id);
  const updateComment = useUpdateComment(id);
  const deleteComment = useDeleteComment(id);

  const { data: attachments = [], isLoading: attachmentsLoading } = useAttachments(id, openedTabs.has("attachments"));
  const uploadAttachment = useUploadAttachment(id);
  const deleteAttachment = useDeleteAttachment(id);

  const { data: deps } = useTaskDependencies(id, openedTabs.has("dependencies"));
  const addDep = useAddDependency(id);
  const removeDep = useRemoveDependency(id);
  const { data: depTodoData } = useTasks({ status: "todo", limit: 200 });
  const { data: depInProgressData } = useTasks({ status: "in_progress", limit: 200 });
  const blockableTasks = useMemo(() => {
    const existing = new Set(deps?.blocked_by?.map((d) => d.depends_on_id) ?? []);
    return [...(depTodoData?.data ?? []), ...(depInProgressData?.data ?? [])].filter(
      (t) => t.id !== id && !existing.has(t.id)
    );
  }, [depTodoData, depInProgressData, deps, id]);
  const filteredBlockable = depFilter
    ? blockableTasks.filter((t) => t.title.toLowerCase().includes(depFilter.toLowerCase()))
    : blockableTasks;

  const { data: activityLogs = [], isLoading: activityLoading } = useTaskActivity(id, openedTabs.has("activity"));

  const { data: adminUsers = [] } = useAdminUsers(user?.role === "admin");

  // Sharing hooks
  const { data: shareToken } = useShareToken(id);
  const createShareToken = useCreateShareToken();
  const deleteShareToken = useDeleteShareToken();

  // Watchers hooks
  const { data: watchers = [] } = useWatchers(id);
  const { data: watchStatus } = useWatchStatus(id);
  const addWatcher = useAddWatcher();
  const removeWatcher = useRemoveWatcher();

  // Time tracking hooks
  const { data: timeEntries = [] } = useTimeEntries(id, openedTabs.has("time_logs"));
  const { data: activeTimeEntry } = useActiveTimeEntry(id);
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const deleteTimeEntry = useDeleteTimeEntry();

  const totalDurationSeconds = useMemo(() => {
    return timeEntries.reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0);
  }, [timeEntries]);

  // Custom fields hooks
  const { data: fieldDefs = [] } = useCustomFieldDefs();
  const { data: fieldValues = [] } = useTaskFieldValues(id);
  const setFieldValue = useSetFieldValue();

  // DnD for subtasks
  const sensors = useSensors(useSensor(PointerSensor));
  const handleSubtaskDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    reorderSubtasks.mutate(reordered.map((s) => s.id));
  }, [subtasks, reorderSubtasks]);

  // Initialize form from task (only when task id changes)
  useEffect(() => {
    if (task) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assignee_id);
      setSelectedDate(task.due_date ? parseISO(task.due_date) : undefined);
      setRecurrence(task.recurrence);
      setRecurrenceEnd(task.recurrence_end ? parseISO(task.recurrence_end) : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const savePatch = useCallback(async (patch: Partial<Task>) => {
    setSaveStatus("saving");
    try {
      await updateTask.mutateAsync({ id, ...patch });
      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [id, updateTask]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setOpenedTabs((prev) => {
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    await createSubtask.mutateAsync(newSubtaskTitle.trim());
    setNewSubtaskTitle("");
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tag = await createTagMutation.mutateAsync({ name: newTagName.trim(), color: newTagColor });
    await addTagToTask.mutateAsync(tag.id);
    setNewTagName("");
    setNewTagColor(TAG_COLORS[0]);
  };

  const handleCreateComment = async () => {
    if (!commentBody.trim()) return;
    await createComment.mutateAsync(commentBody.trim());
    setCommentBody("");
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentBody.trim()) return;
    await updateComment.mutateAsync({ id: commentId, body: editingCommentBody.trim() });
    setEditingCommentId(null);
    setEditingCommentBody("");
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    try {
      for (const file of arr) await uploadAttachment.mutateAsync(file);
      toast.success(arr.length === 1 ? "File uploaded" : `${arr.length} files uploaded`);
    } catch { toast.error("Upload failed"); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async () => {
    try {
      await deleteTask.mutateAsync(id);
      router.push("/tasks");
    } catch {
      toast.error("Failed to delete task");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-5xl mx-auto">
        <div className="h-8 w-28 rounded bg-muted animate-pulse" />
        <div className="h-20 rounded-xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="h-32 rounded-xl bg-muted animate-pulse" />
            <div className="h-64 rounded-xl bg-muted animate-pulse" />
          </div>
          <div className="h-80 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center max-w-5xl mx-auto">
        <p className="font-semibold">Task not found</p>
        <p className="text-sm text-muted-foreground">This task may have been deleted or you don&apos;t have access.</p>
        <Button variant="outline" onClick={() => router.push("/tasks")}>
          <ArrowLeft className="size-4" />
          Back to tasks
        </Button>
      </div>
    );
  }

  const taskTags = task.tags ?? [];
  const taskTagIds = new Set(taskTags.map((t) => t.id));
  const isBlocked = (deps?.blocked_by?.length ?? 0) > 0;
  const subtaskDone = subtasks.filter((s) => s.done).length;
  const subtaskTotal = subtasks.length;
  const subtaskCount = openedTabs.has("subtasks") ? subtaskTotal : task.subtask_count;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => router.push("/tasks")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to tasks
        </button>

        <div className="flex items-center gap-3">
          {/* Save status indicator */}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in-0">
              <Check className="size-3" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-rose-500">Save failed</span>
          )}

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Delete this task?</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDelete}
                disabled={deleteTask.isPending}
              >
                {deleteTask.isPending ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Title block with priority accent */}
      <div className={cn("relative rounded-xl px-6 py-5 overflow-hidden", priorityBanner[priority].bg)}>
        <div className={cn("absolute left-0 inset-y-0 w-1 rounded-l-xl", priorityBanner[priority].bar)} />
        <div className="pl-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Task</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) savePatch({ title });
            }}
            className="text-2xl font-bold bg-transparent border-0 border-b-2 border-transparent focus:border-foreground/20 w-full focus:outline-none pb-1 transition-colors placeholder:text-muted-foreground/50"
            placeholder="Task title"
          />
          {taskTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {taskTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => removeTagFromTask.mutate(tag.id)}
                    className="hover:opacity-75"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Blocked warning */}
      {isBlocked && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          This task is blocked by {deps?.blocked_by.length} task(s). Complete blockers before starting.
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

        {/* Main content */}
        <div className="flex flex-col gap-6">
          {/* Description */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Description</Label>
              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setDescPreview(false)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all",
                    !descPreview ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDescPreview(true)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all",
                    descPreview ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Eye className="size-3" />
                  Preview
                </button>
              </div>
            </div>
            {descPreview ? (
              <div
                className={cn(
                  "min-h-[120px] rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed",
                  !description && "text-muted-foreground italic"
                )}
                dangerouslySetInnerHTML={{
                  __html: description ? renderMarkdown(description) : "No description yet.",
                }}
              />
            ) : (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description ?? "")) savePatch({ description });
                }}
                placeholder="Add a description… (supports **bold**, _italic_, `code`)"
                rows={5}
                className="resize-none"
              />
            )}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 border-b border-border rounded-none pb-2">
              <TabsTrigger value="subtasks" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                <CheckCircle2 className="size-3 mr-1.5" />
                Subtasks
                {subtaskCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium data-[state=active]:bg-background">
                    {openedTabs.has("subtasks") ? `${subtaskDone}/${subtaskTotal}` : subtaskCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="comments" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                <MessageSquare className="size-3 mr-1.5" />
                Comments
                {openedTabs.has("comments") && comments.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{comments.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="attachments" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                <Paperclip className="size-3 mr-1.5" />
                Files
                {openedTabs.has("attachments") && attachments.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{attachments.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                <Link2 className="size-3 mr-1.5" />
                Dependencies
                {openedTabs.has("dependencies") && ((deps?.blocked_by?.length ?? 0) + (deps?.blocking?.length ?? 0)) > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                    {(deps?.blocked_by?.length ?? 0) + (deps?.blocking?.length ?? 0)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                Activity
              </TabsTrigger>
              <TabsTrigger value="time_logs" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-7 px-3">
                <Clock className="size-3 mr-1.5" />
                Time Logs
                {openedTabs.has("time_logs") && timeEntries.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{timeEntries.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Subtasks */}
            <TabsContent value="subtasks" className="mt-4">
              {subtaskTotal > 0 && (
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-3">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${subtaskTotal ? (subtaskDone / subtaskTotal) * 100 : 0}%` }}
                  />
                </div>
              )}
              {subtasksLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
                  <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <ul className="flex flex-col divide-y divide-border">
                      {subtasks.map((s) => (
                        <SortableSubtaskItem
                          key={s.id}
                          id={s.id}
                          title={s.title}
                          done={s.done}
                          onToggle={() => updateSubtask.mutate({ id: s.id, done: !s.done, title: s.title })}
                          onDelete={() => deleteSubtask.mutate(s.id)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
              <div className="flex gap-2 mt-3">
                <Input
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add subtask…"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubtask())}
                />
                <Button type="button" size="sm" className="h-8" onClick={handleAddSubtask}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </TabsContent>

            {/* Comments */}
            <TabsContent value="comments" className="mt-4 flex flex-col gap-4">
              {commentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {comments.map((c) => (
                    <li key={c.id} className="flex gap-3 group">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {c.user_email.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold">{c.user_email}</span>
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="flex gap-2">
                            <Textarea
                              value={editingCommentBody}
                              onChange={(e) => setEditingCommentBody(e.target.value)}
                              rows={2}
                              className="text-sm flex-1"
                            />
                            <div className="flex flex-col gap-1">
                              <Button type="button" size="sm" className="h-7 text-xs" onClick={() => handleEditComment(c.id)}>Save</Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
                        )}
                      </div>
                      {c.user_id === user?.id && editingCommentId !== c.id && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }} className="text-muted-foreground hover:text-foreground">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => deleteComment.mutate(c.id)} className="text-muted-foreground hover:text-rose-500">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a comment… (supports **bold**, _italic_, `code`)"
                  rows={3}
                  className="text-sm flex-1"
                />
                <Button type="button" size="sm" className="self-end h-8" onClick={handleCreateComment}>Post</Button>
              </div>
            </TabsContent>

            {/* Attachments */}
            <TabsContent value="attachments" className="mt-4 flex flex-col gap-3">
              {attachmentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : attachments.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {attachments.map((att) => (
                    <li key={att.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/60 transition-colors group">
                      {att.content_type.startsWith("image/") ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={att.url} alt={att.filename} className="h-9 w-9 rounded object-cover border border-border" />
                        </a>
                      ) : <FileTypeIcon contentType={att.content_type} />}
                      <div className="overflow-hidden">
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:text-primary hover:underline">{att.filename}</a>
                        <p className="text-xs text-muted-foreground">{formatBytes(att.size_bytes)}</p>
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon-sm"
                        onClick={() => deleteAttachment.mutateAsync(att.id).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))}
                        aria-label="Delete"
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
              <div
                role="button" tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files); }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => f !== null);
                  if (files.length > 0) uploadFiles(files);
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-all select-none",
                  isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40",
                  uploadAttachment.isPending && "pointer-events-none opacity-60"
                )}
              >
                <UploadCloud className={cn("h-7 w-7 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
                {uploadAttachment.isPending ? (
                  <p className="text-sm text-muted-foreground">Uploading…</p>
                ) : isDragging ? (
                  <p className="text-sm font-medium text-primary">Drop to upload</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">Drop files here or <span className="text-primary underline underline-offset-2">click to browse</span></p>
                    <p className="text-xs text-muted-foreground">Max 10 MB · paste an image with ⌘V / Ctrl+V</p>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Dependencies */}
            <TabsContent value="dependencies" className="mt-4 flex flex-col gap-4">
              {(deps?.blocked_by?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Blocked by</p>
                  <ul className="flex flex-col gap-1.5">
                    {deps?.blocked_by.map((d) => (
                      <li key={d.depends_on_id} className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2">
                        <span>{d.title || d.depends_on_id}</span>
                        <button type="button" onClick={() => removeDep.mutate(d.depends_on_id)} className="text-muted-foreground hover:text-rose-500">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(deps?.blocking?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Blocking</p>
                  <ul className="flex flex-col gap-1.5">
                    {deps?.blocking.map((d) => (
                      <li key={d.task_id} className="text-sm rounded-lg border border-border px-3 py-2">{d.title || d.task_id}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Popover open={depComboOpen} onOpenChange={setDepComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-sm w-full justify-start text-muted-foreground font-normal">
                    <Plus className="size-3.5 mr-1.5" />
                    Add blocker…
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <Input
                    placeholder="Search tasks…"
                    value={depFilter}
                    onChange={(e) => setDepFilter(e.target.value)}
                    className="h-7 text-xs mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                    {filteredBlockable.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-1">No tasks found</p>
                    ) : filteredBlockable.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full"
                        onClick={() => {
                          addDep.mutate(t.id, {
                            onSuccess: () => { setDepComboOpen(false); setDepFilter(""); },
                            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
                          });
                        }}
                      >
                        <span className={cn("size-1.5 rounded-full flex-shrink-0", t.status === "in_progress" ? "bg-blue-500" : "bg-amber-500")} />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </TabsContent>

            {/* Activity */}
            <TabsContent value="activity" className="mt-4">
              {activityLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : activityLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {activityLogs.map((log) => {
                    const changesStr = formatChanges(log.changes);
                    return (
                      <li key={log.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium capitalize", actionBadgeStyle[log.action] ?? "bg-muted text-muted-foreground")}>
                            {log.action}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {changesStr && <p className="text-xs text-muted-foreground pl-0.5">{changesStr}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            {/* Time Logs */}
            <TabsContent value="time_logs" className="mt-4 flex flex-col gap-3">
              {activeTimeEntry ? (
                <ActiveTimeEntryTracker
                  entry={activeTimeEntry}
                  onStop={(note) => {
                    stopTimer.mutate(
                      { taskId: id, entryId: activeTimeEntry.id, note },
                      {
                        onSuccess: () => toast.success("Timer stopped"),
                        onError: () => toast.error("Failed to stop timer"),
                      }
                    );
                  }}
                />
              ) : (
                <StartTimeEntryTracker
                  isPending={startTimer.isPending}
                  onStart={(note) => {
                    startTimer.mutate(
                      { taskId: id, note },
                      {
                        onSuccess: () => toast.success("Timer started"),
                        onError: () => toast.error("Failed to start timer"),
                      }
                    );
                  }}
                />
              )}

              <div className="rounded-xl border border-border bg-card overflow-hidden mt-4">
                <div className="bg-muted/40 px-3 py-2 border-b border-border text-xs font-semibold flex items-center justify-between">
                  <span>Log History</span>
                  <span className="text-muted-foreground">Total: {formatTimeTrackingSeconds(totalDurationSeconds)}</span>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {timeEntries.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No time logged yet.</p>
                  ) : (
                    timeEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/10">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{entry.note || "Work session"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(entry.started_at), "MMM d, yyyy h:mm a")} · {entry.duration_seconds ? formatTimeTrackingSeconds(entry.duration_seconds) : "—"}
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive shrink-0 size-7"
                          onClick={() => {
                            deleteTimeEntry.mutate({ taskId: id, entryId: entry.id }, {
                              onSuccess: () => toast.success("Time entry deleted"),
                              onError: () => toast.error("Failed to delete time entry"),
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">

          <SidebarRow label="Status">
            <Select
              value={status}
              onValueChange={(v) => {
                const val = v as Task["status"];
                setStatus(val);
                savePatch({ status: val });
              }}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["todo", "in_progress", "done", "failed"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">{statusIcon[s]}{statusLabel[s]}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SidebarRow>

          <SidebarRow label="Priority">
            <Select
              value={priority}
              onValueChange={(v) => {
                const val = v as Task["priority"];
                setPriority(val);
                savePatch({ priority: val });
              }}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["low", "medium", "high"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", p === "low" ? "bg-emerald-500" : p === "medium" ? "bg-amber-500" : "bg-rose-500")} />
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SidebarRow>

          <SidebarRow label="Assignee" icon={<User className="size-3" />}>
            <Select
              value={assigneeId ?? "none"}
              onValueChange={(v) => {
                const val = v === "none" ? null : v;
                setAssigneeId(val);
                savePatch({ assignee_id: val });
              }}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {user && <SelectItem value={user.id}>{user.email} (me)</SelectItem>}
                  {adminUsers.filter((u) => u.id !== user?.id).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SidebarRow>

          <SidebarRow label="Due Date" icon={<CalendarIcon className="size-3" />}>
            <div className="flex gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn("flex-1 justify-start text-left font-normal h-8 text-sm", !selectedDate && "text-muted-foreground")}
                  >
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setNlDateInput("");
                      setNlParsed(null);
                      setCalendarOpen(false);
                      savePatch({ due_date: date ? `${format(date, "yyyy-MM-dd")}T00:00:00Z` : null });
                    }}
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8"
                  onClick={() => {
                    setSelectedDate(undefined);
                    setNlDateInput("");
                    setNlParsed(null);
                    savePatch({ due_date: null });
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {/* Natural language date input */}
            <div className="relative mt-1">
              <Input
                value={nlDateInput}
                onChange={(e) => {
                  setNlDateInput(e.target.value);
                  setNlParsed(parseNLDate(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nlParsed) {
                    e.preventDefault();
                    setSelectedDate(nlParsed);
                    setNlDateInput("");
                    setNlParsed(null);
                    savePatch({ due_date: `${format(nlParsed, "yyyy-MM-dd")}T00:00:00Z` });
                  }
                }}
                onBlur={() => {
                  if (nlParsed) {
                    setSelectedDate(nlParsed);
                    setNlDateInput("");
                    setNlParsed(null);
                    savePatch({ due_date: `${format(nlParsed, "yyyy-MM-dd")}T00:00:00Z` });
                  }
                }}
                placeholder="or: tomorrow, next friday…"
                className="h-7 text-xs pr-16"
              />
              {nlParsed && nlDateInput && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium pointer-events-none">
                  {formatNLHint(nlParsed)}
                </span>
              )}
            </div>
          </SidebarRow>

          <SidebarRow label="Recurrence" icon={<RefreshCw className="size-3" />}>
            <Select
              value={recurrence ?? "none"}
              onValueChange={(v) => {
                const val = v === "none" ? null : v;
                setRecurrence(val);
                savePatch({ recurrence: val });
              }}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {recurrence && recurrence !== "none" && (
              <div className="flex gap-2 mt-1">
                <Popover open={recEndCalendarOpen} onOpenChange={setRecEndCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="flex-1 justify-start text-left font-normal h-8 text-xs text-muted-foreground">
                      <CalendarIcon className="mr-2 h-3 w-3 shrink-0" />
                      {recurrenceEnd ? format(recurrenceEnd, "PPP") : "Repeat until…"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={recurrenceEnd}
                      onSelect={(d) => {
                        setRecurrenceEnd(d);
                        setRecEndCalendarOpen(false);
                        savePatch({ recurrence_end: d ? `${format(d, "yyyy-MM-dd")}T00:00:00Z` : null });
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {recurrenceEnd && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8"
                    onClick={() => {
                      setRecurrenceEnd(undefined);
                      savePatch({ recurrence_end: null });
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </SidebarRow>

          {/* Habit tracking */}
          {recurrence && (
            <SidebarRow label="Habit" icon={<RefreshCw className="size-3 text-violet-500" />}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <RefreshCw className="size-2.5" />
                    {recurrence.charAt(0).toUpperCase() + recurrence.slice(1)}
                  </span>
                  {(() => {
                    const completions = activityLogs.filter((log) => {
                      const ch = log.changes as Record<string, unknown> | null;
                      if (!ch) return false;
                      const s = ch.status;
                      return s === "done" || (Array.isArray(s) && s[1] === "done");
                    }).length;
                    return completions > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {completions} completion{completions !== 1 ? "s" : ""}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
            </SidebarRow>
          )}

          {/* Tags */}
          <SidebarRow label="Tags" icon={<Tag className="size-3" />}>
            <Popover open={tagsPopoverOpen} onOpenChange={setTagsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1 w-full justify-start">
                  <Plus className="size-3" />
                  Add tag
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <p className="text-xs font-medium mb-2">Your tags</p>
                <ul className="flex flex-col gap-1 mb-3 max-h-36 overflow-y-auto">
                  {allTags.map((tag) => {
                    const attached = taskTagIds.has(tag.id);
                    return (
                      <li key={tag.id} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                        <Button
                          type="button"
                          variant={attached ? "secondary" : "outline"}
                          size="sm"
                          className="h-5 text-[10px] px-2"
                          onClick={() => attached ? removeTagFromTask.mutate(tag.id) : addTagToTask.mutate(tag.id)}
                        >
                          {attached ? "Remove" : "Add"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs font-medium mb-1.5">New tag</p>
                <div className="flex gap-1 mb-1.5">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={cn("size-5 rounded-full border-2", newTagColor === c ? "border-foreground" : "border-transparent")}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewTagColor(c)}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name"
                    className="h-7 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
                  />
                  <Button type="button" size="sm" className="h-7" onClick={handleCreateTag}>Create</Button>
                </div>
              </PopoverContent>
            </Popover>
          </SidebarRow>

          {/* Custom Fields */}
          {fieldDefs.map((def) => {
            const valObj = fieldValues.find((v) => v.field_id === def.id);
            const currentVal = valObj ? valObj.value : "";
            return (
              <SidebarRow key={def.id} label={def.name} icon={<Sliders className="size-3" />}>
                {def.field_type === "select" ? (
                  <Select
                    value={currentVal || "none"}
                    onValueChange={(v) => {
                      setFieldValue.mutate({ taskId: id, fieldId: def.id, value: v === "none" ? "" : v });
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-sm bg-background">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">Not set</SelectItem>
                        {(def.options ?? []).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : def.field_type === "date" ? (
                  <Input
                    type="date"
                    value={currentVal}
                    onChange={(e) => {
                      setFieldValue.mutate({ taskId: id, fieldId: def.id, value: e.target.value });
                    }}
                    className="h-8 text-xs w-full bg-background"
                  />
                ) : (
                  <Input
                    type={def.field_type === "number" ? "number" : "text"}
                    value={currentVal}
                    onBlur={(e) => {
                      if (e.target.value !== currentVal) {
                        setFieldValue.mutate({ taskId: id, fieldId: def.id, value: e.target.value });
                      }
                    }}
                    placeholder={`Enter ${def.name.toLowerCase()}…`}
                    className="h-8 text-xs w-full bg-background"
                  />
                )}
              </SidebarRow>
            );
          })}

          {/* Watchers */}
          <SidebarRow label="Watchers" icon={<Eye className="size-3" />}>
            <div className="flex flex-col gap-1.5 w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full justify-center gap-1.5"
                onClick={() => {
                  if (watchStatus?.watching) {
                    removeWatcher.mutate(id);
                  } else {
                    addWatcher.mutate(id);
                  }
                }}
              >
                {watchStatus?.watching ? (
                  <>
                    <EyeOff className="size-3 text-rose-500" />
                    Unwatch task
                  </>
                ) : (
                  <>
                    <Eye className="size-3 text-primary" />
                    Watch task
                  </>
                )}
              </Button>
              {watchers.length > 0 && (
                <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1 mt-1 pl-1">
                  <span>Watching:</span>
                  {watchers.map((w) => (
                    <span key={w.user_id} className="underline" title={w.user_email}>
                      {w.user_email.split("@")[0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SidebarRow>

          {/* Public Sharing */}
          <SidebarRow label="Sharing" icon={<Share2 className="size-3" />}>
            <div className="flex flex-col gap-1.5 w-full">
              {shareToken ? (
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-1">
                    <Input
                      readOnly
                      value={`${window.location.origin}/share/${shareToken.token}`}
                      className="h-7 text-[10px] font-mono select-all flex-1 bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken.token}`);
                        toast.success("Copied share link!");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      deleteShareToken.mutate(id, {
                        onSuccess: () => toast.success("Revoked sharing link"),
                        onError: () => toast.error("Failed to revoke link"),
                      });
                    }}
                  >
                    Revoke Share Link
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full justify-center gap-1.5"
                  onClick={() => {
                    createShareToken.mutate(id, {
                      onSuccess: () => toast.success("Share link created!"),
                      onError: () => toast.error("Failed to create share link"),
                    });
                  }}
                >
                  <Globe className="size-3 text-primary" />
                  Make public (share)
                </Button>
              )}
            </div>
          </SidebarRow>

          {/* Timestamps */}
          <div className="border-t border-border pt-3 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Created {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
            </p>
            <p className="text-xs text-muted-foreground">
              Updated {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
            </p>
            {task.assignee_email && (
              <p className="text-xs text-muted-foreground">
                Assigned to {task.assignee_email}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
