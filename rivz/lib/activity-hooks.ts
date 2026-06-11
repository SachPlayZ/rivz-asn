import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type ActivityLog = {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
};

export type ActivityLogWithTask = ActivityLog & {
  task_title: string;
};

export function useTaskActivity(taskId: string, enabled = true) {
  return useQuery<ActivityLog[]>({
    queryKey: ["activity", taskId],
    queryFn: () => api.get<ActivityLog[]>(`/tasks/${taskId}/activity`),
    enabled: !!taskId && enabled,
  });
}

export function useGlobalActivity(enabled = true) {
  return useQuery<ActivityLogWithTask[]>({
    queryKey: ["activity", "global"],
    queryFn: () => api.get<ActivityLogWithTask[]>("/activity"),
    enabled,
  });
}
