"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { taskSchema, type TaskInput } from "@/lib/schemas";
import { useCreateTask, useUpdateTask, type Task } from "@/lib/tasks-hooks";
import { useTaskActivity } from "@/lib/activity-hooks";
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/lib/attachments-hooks";
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
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  Paperclip,
  X,
  CheckCircle2,
  Clock,
  Circle,
  UploadCloud,
  File,
  FileImage,
  FileText,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TaskFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
};

const statusIcon: Record<string, React.ReactNode> = {
  todo: <Circle className="size-3 text-muted-foreground" />,
  in_progress: <Clock className="size-3 text-blue-500" />,
  done: <CheckCircle2 className="size-3 text-emerald-500" />,
};

function formatChanges(changes: Record<string, unknown> | null): string {
  if (!changes || Object.keys(changes).length === 0) return "";
  return Object.entries(changes)
    .map(([key, val]) => {
      const pair = val as [unknown, unknown];
      const fmt = (v: unknown) => {
        if (!v || v === "") return "none";
        if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}T/)) {
          return new Date(v).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
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
};

const statusLabel: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const actionBadgeStyle: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  deleted: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function TaskForm({ open, onOpenChange, task }: TaskFormProps) {
  const isEdit = !!task;
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const initialDate = task?.due_date ? parseISO(task.due_date) : undefined;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? "todo",
      priority: task?.priority ?? "medium",
      due_date: task?.due_date ? task.due_date.slice(0, 10) : null,
    },
  });

  const statusValue = watch("status");
  const priorityValue = watch("priority");

  const { data: attachments = [], isLoading: attachmentsLoading } = useAttachments(
    task?.id ?? "",
    isEdit && attachmentsOpen
  );
  const uploadAttachment = useUploadAttachment(task?.id ?? "");
  const deleteAttachment = useDeleteAttachment(task?.id ?? "");

  const { data: activityLogs = [], isLoading: activityLoading } = useTaskActivity(
    task?.id ?? "",
    isEdit && activityOpen
  );

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setValue("due_date", date ? format(date, "yyyy-MM-dd") : null);
    setCalendarOpen(false);
  };

  const onSubmit = async (data: TaskInput) => {
    try {
      const payload = {
        ...data,
        due_date: data.due_date ? `${data.due_date}T00:00:00Z` : null,
      };
      if (isEdit && task) {
        await updateTask.mutateAsync({ id: task.id, ...payload });
        toast.success("Task updated");
      } else {
        await createTask.mutateAsync(payload);
        toast.success("Task created");
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
    onOpenChange(false);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    try {
      for (const file of arr) {
        await uploadAttachment.mutateAsync(file);
      }
      toast.success(arr.length === 1 ? "File uploaded" : `${arr.length} files uploaded`);
    } catch {
      toast.error("Upload failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) uploadFiles(files);
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await deleteAttachment.mutateAsync(attId);
      toast.success("Attachment deleted");
    } catch {
      toast.error("Failed to delete attachment");
    }
  };

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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              Title <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="title"
              placeholder="What needs to be done?"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-rose-500">{errors.title.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add more details (optional)"
              rows={3}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(val) => setValue("status", val as TaskInput["status"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="todo">
                      <span className="flex items-center gap-2">
                        {statusIcon.todo}
                        Todo
                      </span>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <span className="flex items-center gap-2">
                        {statusIcon.in_progress}
                        In Progress
                      </span>
                    </SelectItem>
                    <SelectItem value="done">
                      <span className="flex items-center gap-2">
                        {statusIcon.done}
                        Done
                      </span>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select
                value={priorityValue}
                onValueChange={(val) => setValue("priority", val as TaskInput["priority"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Low
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-amber-500" />
                        Medium
                      </span>
                    </SelectItem>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-rose-500" />
                        High
                      </span>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Due Date</Label>
            <div className="flex gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDateSelect(undefined)}
                  aria-label="Clear date"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

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
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {attachments.length}
                    </span>
                  )}
                </span>
                {attachmentsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>

              {attachmentsOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border bg-muted/20">
                  {/* File list */}
                  {attachmentsLoading ? (
                    <p className="text-xs text-muted-foreground py-1">Loading...</p>
                  ) : attachments.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {attachments.map((att) => (
                        <li key={att.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors group">
                          {att.content_type.startsWith("image/") ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="h-9 w-9 rounded object-cover border border-border"
                              />
                            </a>
                          ) : (
                            <FileTypeIcon contentType={att.content_type} />
                          )}
                          <div className="overflow-hidden">
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {att.filename}
                            </a>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(att.size_bytes)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteAttachment(att.id)}
                            aria-label="Delete attachment"
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Drop zone */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onPaste={handlePaste}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition-all select-none",
                      isDragging
                        ? "border-primary bg-primary/5 scale-[1.01]"
                        : "border-border hover:border-primary/50 hover:bg-muted/40",
                      uploadAttachment.isPending && "pointer-events-none opacity-60"
                    )}
                  >
                    <UploadCloud className={cn("h-6 w-6 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
                    {uploadAttachment.isPending ? (
                      <p className="text-xs font-medium text-muted-foreground">Uploading…</p>
                    ) : isDragging ? (
                      <p className="text-xs font-medium text-primary">Drop to upload</p>
                    ) : (
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

          {/* Activity — edit mode only */}
          {isEdit && (
            <div className="flex flex-col gap-0 border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors w-full text-left"
                onClick={() => setActivityOpen((v) => !v)}
              >
                <span className="text-sm font-medium">Activity</span>
                {activityOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>

              {activityOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20">
                  {activityLoading ? (
                    <p className="text-xs text-muted-foreground py-1">Loading...</p>
                  ) : activityLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No activity yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 mt-1">
                      {activityLogs.map((log) => {
                        const changesStr = formatChanges(log.changes);
                        return (
                          <li key={log.id} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium capitalize",
                                  actionBadgeStyle[log.action] ?? "bg-muted text-muted-foreground"
                                )}
                              >
                                {log.action}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            {changesStr && (
                              <p className="text-[10px] text-muted-foreground pl-0.5">{changesStr}</p>
                            )}
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
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? isEdit ? "Saving..." : "Creating..."
                : isEdit ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
