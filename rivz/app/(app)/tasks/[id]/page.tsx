import { Suspense } from "react";
import { TaskDetailClient } from "./_components/TaskDetailClient";
import { Skeleton } from "@/components/ui/skeleton";

function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<TaskDetailSkeleton />}>
      <TaskDetailClient id={id} />
    </Suspense>
  );
}
