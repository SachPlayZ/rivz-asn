import { Suspense } from "react";
import { TasksPageClient } from "./_components/TasksPageClient";
import { Skeleton } from "@/components/ui/skeleton";

function TasksPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksPageSkeleton />}>
      <TasksPageClient />
    </Suspense>
  );
}
