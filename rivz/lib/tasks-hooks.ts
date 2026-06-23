import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Tag } from "./tags-hooks";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "failed";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  recurrence: string | null;
  recurrence_end: string | null;
  parent_task_id: string | null;
  assignee_id: string | null;
  assignee_email: string | null;
  sort_order: number;
  effort_points: number | null;
  project_id: string | null;
  project_name: string | null;
  total_time_seconds: number;
  tags: Tag[];
  subtask_count: number;
  subtasks_done: number;
  created_at: string;
  updated_at: string;
};

export type TasksResponse = {
  data: Task[];
  page: number;
  limit: number;
  total: number;
};

export type ListParams = {
  status?: string;
  search?: string;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
  project_id?: string;
  due_date_from?: string; // ISO 8601
  due_date_to?: string;   // ISO 8601
};

function buildQuery(params: ListParams) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.search) q.set("search", params.search);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.project_id) q.set("project_id", params.project_id);
  if (params.due_date_from) q.set("due_date_from", params.due_date_from);
  if (params.due_date_to) q.set("due_date_to", params.due_date_to);
  return q.toString();
}

export function useTasks(params: ListParams) {
  return useQuery<TasksResponse>({
    queryKey: ["tasks", params],
    queryFn: () => api.get<TasksResponse>(`/tasks?${buildQuery(params)}`),
  });
}

export function useTask(id: string) {
  return useQuery<Task>({
    queryKey: ["tasks", id],
    queryFn: () => api.get<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) => api.post<Task>("/tasks", data),
    onMutate: async (newTask) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueriesData<TasksResponse>({ queryKey: ["tasks"] });
      const optimistic: Task = {
        id: `optimistic-${Date.now()}`,
        title: newTask.title ?? "",
        tags: [],
        subtask_count: 0,
        subtasks_done: 0,
        recurrence: null,
        recurrence_end: null,
        parent_task_id: null,
        assignee_id: null,
        assignee_email: null,
        sort_order: 0,
        effort_points: null,
        project_id: null,
        project_name: null,
        total_time_seconds: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        description: newTask.description ?? "",
        status: (newTask.status as Task["status"]) ?? "todo",
        priority: (newTask.priority as Task["priority"]) ?? "medium",
        due_date: newTask.due_date ?? null,
        ...newTask,
      };
      qc.setQueriesData<TasksResponse>({ queryKey: ["tasks"] }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: [optimistic, ...old.data],
          total: old.total + 1,
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Task> & { id: string }) =>
      api.patch<Task>(`/tasks/${id}`, data),
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueriesData<TasksResponse>({ queryKey: ["tasks"] });
      const prevSingle = qc.getQueryData<Task>(["tasks", updated.id]);
      qc.setQueriesData<TasksResponse>({ queryKey: ["tasks"] }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map((t) =>
            t.id === updated.id ? { ...t, ...updated } : t
          ),
        };
      });
      if (prevSingle) {
        qc.setQueryData<Task>(["tasks", updated.id], { ...prevSingle, ...updated });
      }
      return { prev, prevSingle };
    },
    onError: (_err, vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevSingle) qc.setQueryData(["tasks", vars.id], ctx.prevSingle);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueriesData<TasksResponse>({ queryKey: ["tasks"] });
      qc.setQueriesData<TasksResponse>({ queryKey: ["tasks"] }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.filter((t) => t.id !== id),
          total: old.total - 1,
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) =>
      api.put<void>("/tasks/reorder", items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useBulkUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: string[]; status?: string; priority?: string }) =>
      api.post<void>("/tasks/bulk-update", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useBulkDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<void>("/tasks/bulk-delete", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
