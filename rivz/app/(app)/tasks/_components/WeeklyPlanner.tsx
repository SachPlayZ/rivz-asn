"use client";
import { useState, useEffect } from "react";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  addWeeks,
  parseISO,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/tasks-hooks";
import { cn } from "@/lib/utils";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

const priorityDot: Record<string, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

type Props = {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onUpdateDueDate: (taskId: string, dueDate: string) => void;
  onRangeChange?: (from: string, to: string) => void;
};

function DraggableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-1 rounded-md bg-card border border-border/50 px-1.5 py-1 hover:border-border transition-all cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <span
        className={cn(
          "mt-0.5 size-1.5 rounded-full shrink-0",
          priorityDot[task.priority] ?? "bg-muted-foreground"
        )}
      />
      <span className="text-[10px] font-medium leading-tight line-clamp-2 text-left">
        {task.title}
      </span>
    </button>
  );
}

function DroppableDayCell({
  day,
  children,
  today,
}: {
  day: Date;
  children: React.ReactNode;
  today: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: format(day, "yyyy-MM-dd") });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border p-2 min-h-[120px] transition-all",
        today && "border-blue-500/50 bg-blue-500/5",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary"
      )}
    >
      {children}
    </div>
  );
}

export function WeeklyPlanner({ tasks, onTaskClick, onUpdateDueDate, onRangeChange }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [undatedOpen, setUndatedOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const baseWeek = addWeeks(new Date(), weekOffset);
  const weekStart = startOfWeek(baseWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(baseWeek, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    if (!onRangeChange) return;
    onRangeChange(weekStart.toISOString(), weekEnd.toISOString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, onRangeChange]);

  const tasksForDay = (day: Date) =>
    tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), day));

  const undatedTasks = tasks.filter((t) => !t.due_date);

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const date = String(e.over.id); // yyyy-MM-dd
    const task = tasks.find((t) => t.id === taskId);
    if (task && (!task.due_date || !isSameDay(parseISO(task.due_date), parseISO(date)))) {
      onUpdateDueDate(taskId, date);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {weekOffset !== 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={() => setWeekOffset(0)}
          >
            This week
          </Button>
        )}
      </div>

      {/* 7-column grid */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-7 gap-2 min-h-[320px]">
          {days.map((day) => {
            const dayTasks = tasksForDay(day);
            const today = isToday(day);

            return (
              <DroppableDayCell key={day.toISOString()} day={day} today={today}>
                {/* Day header */}
                <div className="flex flex-col items-center mb-1">
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      today ? "text-blue-500" : "text-muted-foreground"
                    )}
                  >
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold leading-none mt-0.5",
                      today
                        ? "size-6 rounded-full bg-blue-500 text-white flex items-center justify-center"
                        : "text-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Task cards */}
                {dayTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  </div>
                ) : (
                  dayTasks.map((task) => (
                    <DraggableTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                  ))
                )}
              </DroppableDayCell>
            );
          })}
        </div>
      </DndContext>

      {/* Undated tasks */}
      {undatedTasks.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
            onClick={() => setUndatedOpen((v) => !v)}
          >
            <span className="flex items-center gap-2">
              No due date
              <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-normal text-muted-foreground">
                {undatedTasks.length}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                undatedOpen && "rotate-180"
              )}
            />
          </button>
          {undatedOpen && (
            <div className="p-3 flex flex-wrap gap-2">
              {undatedTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-foreground/30 transition-colors"
                >
                  <span
                    className={cn("size-1.5 rounded-full shrink-0", priorityDot[task.priority])}
                  />
                  {task.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
