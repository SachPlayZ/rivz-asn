"use client";
import { useRef, useState, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, formatDistanceToNow, addDays, addWeeks, startOfDay } from "date-fns";
import { parseNLDate, formatNLHint } from "@/lib/nldate";
import { taskSchema, type TaskInput } from "@/lib/schemas";
import { useCreateTask, useUpdateTask, useTasks, type Task } from "@/lib/tasks-hooks";
import { useTaskActivity } from "@/lib/activity-hooks";
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/lib/attachments-hooks";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask, useReorderSubtasks } from "@/lib/subtasks-hooks";
import { useTags, useCreateTag, useAddTagToTask, useRemoveTagFromTask } from "@/lib/tags-hooks";
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from "@/lib/comments-hooks";
import { useTaskDependencies, useAddDependency, useRemoveDependency } from "@/lib/dependencies-hooks";
import { useAdminUsers } from "@/lib/admin-hooks";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  CalendarIcon,
  ChevronDown,
  ChevronUp,
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
  BellRing,
  Sliders,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useReminders,
  useCreateReminder,
  useDeleteReminder,
} from "@/lib/reminders-hooks";
import { useTemplates, useCreateTemplate, useDeleteTemplate } from "@/lib/templates-hooks";
import { useCustomFieldDefs, useTaskFieldValues, useSetFieldValue } from "@/lib/customfields-hooks";
import { toast } from "sonner";

type TaskFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  defaultDate?: string; // yyyy-MM-dd
};

const statusIcon: Record<string, React.ReactNode> = {
  todo: <Circle className="size-3 text-muted-foreground" />,
  in_progress: <Clock className="size-3 text-blue-500" />,
  done: <CheckCircle2 className="size-3 text-emerald-500" />,
  failed: <XCircle className="size-3 text-rose-500" />,
};

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

const priorityBanner: Record<string, { bar: string; bg: string; badge: string; label: string }> = {
  low:    { bar: "bg-emerald-500", bg: "bg-emerald-500/5 dark:bg-emerald-500/10", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", label: "Low" },
  medium: { bar: "bg-amber-500",   bg: "bg-amber-500/5 dark:bg-amber-500/10",     badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",     label: "Medium" },
  high:   { bar: "bg-rose-500",    bg: "bg-rose-500/5 dark:bg-rose-500/10",       badge: "bg-rose-500/15 text-rose-700 dark:text-rose-400",       label: "High" },
};

const statusBannerStyle: Record<string, string> = {
  todo:        "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  done:        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed:      "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const statusLabel: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  failed: "Failed",
};

const actionBadgeStyle: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  deleted: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const TAG_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6"];

// Markdown-lite renderer
function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code class='text-xs bg-muted px-1 rounded'>$1</code>")
    .replace(/\n/g, "<br/>");
}

function SortableSubtaskItem({
  id, title, done,
  onToggle, onDelete,
}: {
  id: string; title: string; done: boolean;
  onToggle: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 group py-1"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="size-3.5" />
      </span>
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        className="rounded"
      />
      <span className={cn("text-xs flex-1", done && "line-through text-muted-foreground")}>{title}</span>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

export function TaskForm({ open, onOpenChange, task, defaultDate }: TaskFormProps) {
  const isEdit = !!task;
  const { user } = useAuth();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  // Templates
  const { data: templates = [] } = useTemplates();
  const createTemplate = useCreateTemplate();

  // Custom Fields
  const { data: fieldDefs = [] } = useCustomFieldDefs();
  const { data: fieldValues = [] } = useTaskFieldValues(task?.id ?? "", !!task?.id);
  const setFieldValue = useSetFieldValue();

  // Local state for custom fields in creation/edit mode
  const [localFieldValues, setLocalFieldValues] = useState<Record<string, string>>({});

  // Sync edit values
  useEffect(() => {
    if (task && fieldValues.length > 0) {
      const vals: Record<string, string> = {};
      for (const val of fieldValues) {
        vals[val.field_id] = val.value;
      }
      setLocalFieldValues(vals);
    } else {
      setLocalFieldValues({});
    }
  }, [task, fieldValues, open]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? "todo",
      priority: task?.priority ?? "medium",
      due_date: task?.due_date ? task.due_date.slice(0, 10) : defaultDate ?? null,
      recurrence: (task?.recurrence as TaskInput["recurrence"]) ?? null,
      recurrence_end: task?.recurrence_end ? task.recurrence_end.slice(0, 10) : null,
      assignee_id: task?.assignee_id ?? null,
    },
  });

  const [statusValue, priorityValue, recurrenceValue, recurrenceEnd, assigneeId] = useWatch({
    control,
    name: ["status", "priority", "recurrence", "recurrence_end", "assignee_id"],
  });

  const initialDate = task?.due_date ? parseISO(task.due_date) : defaultDate ? parseISO(defaultDate) : undefined;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);

  useEffect(() => {
    if (open && !task && defaultDate) {
      const d = parseISO(defaultDate);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(d);
      setValue("due_date", defaultDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [recEndCalendarOpen, setRecEndCalendarOpen] = useState(false);
  const [nlDateInput, setNlDateInput] = useState("");
  const [nlParsed, setNlParsed] = useState<Date | null>(null);

  const DATE_CHIPS = [
    { label: "Today",     date: () => startOfDay(new Date()) },
    { label: "Tomorrow",  date: () => addDays(startOfDay(new Date()), 1) },
    { label: "Next week", date: () => addWeeks(startOfDay(new Date()), 1) },
  ] as const;

  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(false);
  const [tagsPopoverOpen, setTagsPopoverOpen] = useState(false);

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

  // Data fetching
  const { data: attachments = [], isLoading: attachmentsLoading } = useAttachments(task?.id ?? "", isEdit && attachmentsOpen);
  const uploadAttachment = useUploadAttachment(task?.id ?? "");
  const deleteAttachment = useDeleteAttachment(task?.id ?? "");
  const { data: activityLogs = [], isLoading: activityLoading } = useTaskActivity(task?.id ?? "", isEdit && activityOpen);
  const { data: subtasks = [], isLoading: subtasksLoading } = useSubtasks(task?.id ?? "", isEdit && subtasksOpen);
  const createSubtask = useCreateSubtask(task?.id ?? "");
  const updateSubtask = useUpdateSubtask(task?.id ?? "");
  const deleteSubtask = useDeleteSubtask(task?.id ?? "");
  const reorderSubtasks = useReorderSubtasks(task?.id ?? "");
  const { data: allTags = [] } = useTags();
  const createTagMutation = useCreateTag();
  const addTagToTask = useAddTagToTask(task?.id ?? "");
  const removeTagFromTask = useRemoveTagFromTask(task?.id ?? "");
  const { data: comments = [], isLoading: commentsLoading } = useComments(task?.id ?? "", isEdit && commentsOpen);
  const createComment = useCreateComment(task?.id ?? "");
  const updateComment = useUpdateComment(task?.id ?? "");
  const deleteComment = useDeleteComment(task?.id ?? "");
  const { data: deps } = useTaskDependencies(task?.id ?? "", isEdit && depsOpen);
  const addDep = useAddDependency(task?.id ?? "");
  const removeDep = useRemoveDependency(task?.id ?? "");
  const { data: depTodoData } = useTasks({ status: "todo", limit: 200 });
  const { data: depInProgressData } = useTasks({ status: "in_progress", limit: 200 });
  const blockableTasks = useMemo(() => {
    const existing = new Set(deps?.blocked_by?.map((d) => d.depends_on_id) ?? []);
    return [...(depTodoData?.data ?? []), ...(depInProgressData?.data ?? [])].filter(
      (t) => t.id !== task?.id && !existing.has(t.id)
    );
  }, [depTodoData, depInProgressData, deps, task?.id]);
  const filteredBlockable = depFilter
    ? blockableTasks.filter((t) => t.title.toLowerCase().includes(depFilter.toLowerCase()))
    : blockableTasks;
  const { data: adminUsers = [] } = useAdminUsers(user?.role === "admin");

  const taskTags = task?.tags ?? [];
  const taskTagIds = new Set(taskTags.map((t) => t.id));

  // DnD for subtasks
  const sensors = useSensors(useSensor(PointerSensor));
  const handleSubtaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    reorderSubtasks.mutate(reordered.map((s) => s.id));
  };

  const subtaskDone = subtasks.filter((s) => s.done).length;
  const subtaskTotal = subtasks.length;

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setValue("due_date", date ? format(date, "yyyy-MM-dd") : null);
    setNlDateInput("");
    setNlParsed(null);
    setCalendarOpen(false);
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setValue("title", tmpl.title || "");
    setValue("description", tmpl.description || "");
    setValue("priority", (tmpl.priority as TaskInput["priority"]) || "medium");
    setValue("status", (tmpl.status as TaskInput["status"]) || "todo");
    toast.success(`Applied template "${tmpl.name}"`);
  };

  const handleSaveAsTemplate = () => {
    const vals = getValues();
    const titleVal = vals.title || "";
    if (!titleVal.trim()) {
      toast.error("Please enter a task title first to save as a template");
      return;
    }
    const namePrompt = prompt("Enter a name for this template:", "New Template");
    if (!namePrompt?.trim()) return;

    createTemplate.mutate({
      name: namePrompt.trim(),
      title: titleVal,
      description: vals.description || "",
      priority: vals.priority || "medium",
      status: vals.status || "todo",
    }, {
      onSuccess: () => toast.success(`Saved template "${namePrompt}"`),
      onError: () => toast.error("Failed to save template"),
    });
  };

  const onSubmit = async (data: TaskInput) => {
    try {
      const payload = {
        ...data,
        due_date: data.due_date ? `${data.due_date}T00:00:00Z` : null,
        recurrence_end: data.recurrence_end ? `${data.recurrence_end}T00:00:00Z` : null,
        assignee_id: data.assignee_id || null,
      };
      let resolvedTask: Task | null = null;
      if (isEdit && task) {
        await updateTask.mutateAsync({ id: task.id, ...payload });
        resolvedTask = task;
        toast.success("Task updated");
      } else {
        resolvedTask = await createTask.mutateAsync(payload);
        toast.success("Task created");
      }

      if (resolvedTask) {
        for (const [fieldId, val] of Object.entries(localFieldValues)) {
          const original = fieldValues.find((fv) => fv.field_id === fieldId)?.value ?? "";
          if (val !== original) {
            await setFieldValue.mutateAsync({ taskId: resolvedTask.id, fieldId, value: val });
          }
        }
      }
      handleClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  const handleClose = () => {
    reset();
    setSelectedDate(initialDate);
    setAttachmentsOpen(false);
    setActivityOpen(false);
    setSubtasksOpen(false);
    setCommentsOpen(false);
    setDepsOpen(false);
    onOpenChange(false);
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

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    await createSubtask.mutateAsync(newSubtaskTitle.trim());
    setNewSubtaskTitle("");
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tag = await createTagMutation.mutateAsync({ name: newTagName.trim(), color: newTagColor });
    if (task) await addTagToTask.mutateAsync(tag.id);
    setNewTagName("");
    setNewTagColor(TAG_COLORS[0]);
  };

  const handleCreateComment = async () => {
    if (!commentBody.trim()) return;
    await createComment.mutateAsync(commentBody.trim());
    setCommentBody("");
  };

  const handleEditComment = async (id: string) => {
    if (!editingCommentBody.trim()) return;
    await updateComment.mutateAsync({ id, body: editingCommentBody.trim() });
    setEditingCommentId(null);
    setEditingCommentBody("");
  };

  const isBlocked = (deps?.blocked_by?.length ?? 0) > 0;

  // All tasks for dependency search (use allTags source but we need tasks — use adminUsers tasks approach)
  // For simplicity, filter from the useTasks result which is already in QueryClient
  // We'll just show a text input for task ID as a fallback — but plan says combobox.
  // We'll use a simple filtered list from the admin users context.

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-x-hidden overflow-y-auto p-0 gap-0">
        {isEdit && task ? (
          <div className={cn("relative overflow-hidden rounded-t-xl px-5 pt-5 pb-4", priorityBanner[task.priority].bg)}>
            <div className={cn("absolute left-0 inset-y-0 w-1 rounded-tl-xl", priorityBanner[task.priority].bar)} />
            <div className="flex items-start gap-3 pl-2 pr-8">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Task</p>
                <h2 className="text-base font-semibold leading-snug line-clamp-2">{task.title}</h2>
                {taskTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {taskTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0 mt-0.5">
                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", priorityBanner[task.priority].badge)}>
                  {priorityBanner[task.priority].label}
                </span>
                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", statusBannerStyle[task.status])}>
                  {statusIcon[task.status]}
                  {statusLabel[task.status]}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-5 pb-5 pt-4">
          {/* Blocked warning */}
          {isEdit && isBlocked && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              This task is blocked by {deps?.blocked_by.length} task(s).
            </div>
          )}

          {/* Templates Selection */}
          {!isEdit && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Layers className="size-3.5 text-primary" /> Apply a Task Template
              </Label>
              <div className="flex gap-2 items-center">
                <Select onValueChange={(val) => handleApplyTemplate(val)}>
                  <SelectTrigger className="w-full text-xs h-8 bg-background flex-1">
                    <SelectValue placeholder={templates.length > 0 ? "Select a template to pre-fill…" : "No templates saved yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {templates.map((tmpl) => (
                        <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs">
                          {tmpl.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={handleSaveAsTemplate}
                >
                  Save Form as Template
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title <span className="text-rose-500">*</span></Label>
            <Input id="title" placeholder="What needs to be done?" aria-invalid={!!errors.title} {...register("title")} />
            {errors.title && <p className="text-xs text-rose-500">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Add more details (optional)" rows={3} {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={statusValue} onValueChange={(val) => setValue("status", val as TaskInput["status"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(["todo","in_progress","done","failed"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">{statusIcon[s]}{statusLabel[s]}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select value={priorityValue} onValueChange={(val) => setValue("priority", val as TaskInput["priority"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(["low","medium","high"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", p === "low" ? "bg-emerald-500" : p === "medium" ? "bg-amber-500" : "bg-rose-500")} />
                          {p.charAt(0).toUpperCase()+p.slice(1)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date */}
          <div className="flex flex-col gap-1.5">
            <Label>Due Date</Label>
            {/* Quick chips */}
            <div className="flex gap-1.5">
              {DATE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleDateSelect(chip.date())}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    selectedDate && format(selectedDate, "yyyy-MM-dd") === format(chip.date(), "yyyy-MM-dd")
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className={cn("flex-1 justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleDateSelect(undefined)}><X className="h-4 w-4" /></Button>
              )}
            </div>
            {/* NL date input */}
            <div className="relative">
              <Input
                value={nlDateInput}
                onChange={(e) => {
                  setNlDateInput(e.target.value);
                  setNlParsed(parseNLDate(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nlParsed) {
                    e.preventDefault();
                    handleDateSelect(nlParsed);
                  }
                }}
                onBlur={() => {
                  if (nlParsed) handleDateSelect(nlParsed);
                }}
                placeholder="or: tomorrow, next friday, in 3 days…"
                className="h-8 text-xs pr-16"
              />
              {nlParsed && nlDateInput && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium pointer-events-none">
                  {formatNLHint(nlParsed)}
                </span>
              )}
            </div>
          </div>

          {/* Recurrence */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label><RefreshCw className="size-3 inline mr-1" />Recurrence</Label>
              <Select
                value={recurrenceValue ?? "none"}
                onValueChange={(v) => setValue("recurrence", v === "none" ? null : v as TaskInput["recurrence"])}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {recurrenceValue && (recurrenceValue as string) !== "none" && (
              <div className="flex flex-col gap-1.5">
                <Label>Repeat until</Label>
                <Popover open={recEndCalendarOpen} onOpenChange={setRecEndCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start text-left font-normal text-muted-foreground">
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {recurrenceEnd ? format(parseISO(recurrenceEnd), "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={recurrenceEnd ? parseISO(recurrenceEnd) : undefined}
                      onSelect={(d) => {
                        setValue("recurrence_end", d ? format(d, "yyyy-MM-dd") : null);
                        setRecEndCalendarOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Assignee */}
          <div className="flex flex-col gap-1.5">
            <Label><User className="size-3 inline mr-1" />Assignee</Label>
            <Select
              value={assigneeId ?? "none"}
              onValueChange={(v) => setValue("assignee_id", v === "none" ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {user && <SelectItem value={user.id}>{user.email} (me)</SelectItem>}
                  {adminUsers
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Fields */}
          {fieldDefs.length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Sliders className="size-3.5 text-primary" /> Custom Fields
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {fieldDefs.map((def) => {
                  const currentVal = localFieldValues[def.id] ?? "";
                  return (
                    <div key={def.id} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{def.name}</span>
                      {def.field_type === "select" ? (
                        <Select
                          value={currentVal || "none"}
                          onValueChange={(v) => {
                            setLocalFieldValues((prev) => ({
                              ...prev,
                              [def.id]: v === "none" ? "" : v,
                            }));
                          }}
                        >
                          <SelectTrigger className="w-full h-8 text-xs bg-background">
                            <SelectValue placeholder="Not set" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="none">Not set</SelectItem>
                              {(def.options ?? []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : def.field_type === "date" ? (
                        <Input
                          type="date"
                          value={currentVal}
                          onChange={(e) => {
                            setLocalFieldValues((prev) => ({
                              ...prev,
                              [def.id]: e.target.value,
                            }));
                          }}
                          className="h-8 text-xs w-full bg-background"
                        />
                      ) : (
                        <Input
                          type={def.field_type === "number" ? "number" : "text"}
                          value={currentVal}
                          onChange={(e) => {
                            setLocalFieldValues((prev) => ({
                              ...prev,
                              [def.id]: e.target.value,
                            }));
                          }}
                          placeholder={`Enter ${def.name.toLowerCase()}…`}
                          className="h-8 text-xs w-full bg-background"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label><Tag className="size-3 inline mr-1" />Tags</Label>
                <Popover open={tagsPopoverOpen} onOpenChange={setTagsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-6 text-xs gap-1">
                      <Plus className="size-3" /> Add tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-3">
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
              </div>
              {taskTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {taskTags.map((tag) => (
                    <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                      <button type="button" onClick={() => removeTagFromTask.mutate(tag.id)} className="hover:opacity-75">
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subtasks — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setSubtasksOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Subtasks
                  {subtaskTotal > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {subtaskDone}/{subtaskTotal}
                    </span>
                  )}
                </span>
                {subtasksOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {subtasksOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-2 border-t border-border bg-muted/20">
                  {subtaskTotal > 0 && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${subtaskTotal ? (subtaskDone / subtaskTotal) * 100 : 0}%` }}
                      />
                    </div>
                  )}
                  {subtasksLoading ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
                      <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-0">
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
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="Add subtask..."
                      className="h-7 text-xs"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubtask())}
                    />
                    <Button type="button" size="sm" className="h-7" onClick={handleAddSubtask}>Add</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dependencies — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setDepsOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Dependencies
                  {((deps?.blocked_by?.length ?? 0) + (deps?.blocking?.length ?? 0)) > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {(deps?.blocked_by?.length ?? 0) + (deps?.blocking?.length ?? 0)}
                    </span>
                  )}
                </span>
                {depsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {depsOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border bg-muted/20">
                  {(deps?.blocked_by?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Blocked by</p>
                      <ul className="flex flex-col gap-1">
                        {deps?.blocked_by.map((d) => (
                          <li key={d.depends_on_id} className="flex items-center justify-between text-xs">
                            <span>{d.title || d.depends_on_id}</span>
                            <button type="button" onClick={() => removeDep.mutate(d.depends_on_id)} className="text-muted-foreground hover:text-rose-500">
                              <X className="size-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(deps?.blocking?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Blocking</p>
                      <ul className="flex flex-col gap-1">
                        {deps?.blocking.map((d) => (
                          <li key={d.task_id} className="text-xs">{d.title || d.task_id}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Popover open={depComboOpen} onOpenChange={setDepComboOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs w-full justify-start text-muted-foreground font-normal">
                        <Plus className="size-3 mr-1.5" />
                        Add blocker…
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
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
                </div>
              )}
            </div>
          )}

          {/* Attachments — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setAttachmentsOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  Attachments
                  {attachments.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{attachments.length}</span>
                  )}
                </span>
                {attachmentsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {attachmentsOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border bg-muted/20">
                  {attachmentsLoading ? <p className="text-xs text-muted-foreground py-1">Loading...</p> : attachments.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {attachments.map((att) => (
                        <li key={att.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors group">
                          {att.content_type.startsWith("image/") ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={att.url} alt={att.filename} className="h-9 w-9 rounded object-cover border border-border" />
                            </a>
                          ) : <FileTypeIcon contentType={att.content_type} />}
                          <div className="overflow-hidden">
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium text-foreground hover:text-primary hover:underline">{att.filename}</a>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(att.size_bytes)}</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => deleteAttachment.mutateAsync(att.id).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))} aria-label="Delete" className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity">
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
                    className={cn("relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition-all select-none", isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40", uploadAttachment.isPending && "pointer-events-none opacity-60")}
                  >
                    <UploadCloud className={cn("h-6 w-6 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
                    {uploadAttachment.isPending ? <p className="text-xs font-medium text-muted-foreground">Uploading…</p> : isDragging ? <p className="text-xs font-medium text-primary">Drop to upload</p> : (
                      <>
                        <p className="text-xs font-medium text-foreground">Drop files here or <span className="text-primary underline underline-offset-2">click to browse</span></p>
                        <p className="text-[10px] text-muted-foreground">Max 10 MB · or paste an image with ⌘V / Ctrl+V</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reminders — edit mode only */}
          {isEdit && task && <RemindersSection taskId={task.id} />}

          {/* Comments — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setCommentsOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Comments
                  {comments.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{comments.length}</span>
                  )}
                </span>
                {commentsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {commentsOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border bg-muted/20">
                  {commentsLoading ? <p className="text-xs text-muted-foreground">Loading...</p> : comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {comments.map((c) => (
                        <li key={c.id} className="flex gap-2 group">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                            {c.user_email.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-semibold">{c.user_email}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                            </div>
                            {editingCommentId === c.id ? (
                              <div className="flex gap-1">
                                <Textarea
                                  value={editingCommentBody}
                                  onChange={(e) => setEditingCommentBody(e.target.value)}
                                  rows={2}
                                  className="text-xs"
                                />
                                <div className="flex flex-col gap-1">
                                  <Button type="button" size="sm" className="h-6 text-xs" onClick={() => handleEditComment(c.id)}>Save</Button>
                                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
                            )}
                          </div>
                          {c.user_id === user?.id && editingCommentId !== c.id && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="size-3" />
                              </button>
                              <button type="button" onClick={() => deleteComment.mutate(c.id)} className="text-muted-foreground hover:text-rose-500">
                                <Trash2 className="size-3" />
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
                      placeholder="Add a comment... (@email to mention)"
                      rows={2}
                      className="text-xs flex-1"
                    />
                    <Button type="button" size="sm" className="self-end h-7" onClick={handleCreateComment}>Post</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activity — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setActivityOpen((v) => !v)}
              >
                <span className="text-sm font-medium">Activity</span>
                {activityOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {activityOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20">
                  {activityLoading ? <p className="text-xs text-muted-foreground py-1">Loading...</p> : activityLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No activity yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 mt-1">
                      {activityLogs.map((log) => {
                        const changesStr = formatChanges(log.changes);
                        return (
                          <li key={log.id} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium capitalize", actionBadgeStyle[log.action] ?? "bg-muted text-muted-foreground")}>
                                {log.action}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            {changesStr && <p className="text-[10px] text-muted-foreground pl-0.5">{changesStr}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save changes" : "Create task")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemindersSection({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const { data: reminders = [] } = useReminders(taskId, open);
  const create = useCreateReminder(taskId);
  const del = useDeleteReminder(taskId);
  const [when, setWhen] = useState("");

  const add = () => {
    if (!when) return;
    create.mutate(
      { remind_at: new Date(when).toISOString() },
      {
        onSuccess: () => {
          setWhen("");
          toast.success("Reminder set");
        },
        onError: () => toast.error("Failed to set reminder"),
      }
    );
  };

  return (
    <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
          Reminders
          {reminders.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {reminders.length}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 flex flex-col gap-2 border-t border-border bg-muted/20">
          {reminders.map((rm) => (
            <div key={rm.id} className="flex items-center gap-2 text-xs">
              <BellRing className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="flex-1">
                {new Date(rm.remind_at).toLocaleString()}
                {rm.sent && <span className="text-muted-foreground"> · sent</span>}
              </span>
              <button
                type="button"
                onClick={() => del.mutate(rm.id)}
                className="text-muted-foreground hover:text-rose-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Button type="button" size="sm" className="h-8" onClick={add} disabled={!when || create.isPending}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
