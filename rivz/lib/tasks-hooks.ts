import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
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
};

function buildQuery(params: ListParams) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.search) q.set("search", params.search);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  return q.toString();
}

export function useTasks(params: ListParams) {
  return useQuery<TasksResponse>({
    queryKey: ["tasks", params],
    queryFn: () => api.get<TasksResponse>(`/tasks?${buildQuery(params)}`),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) => api.post<Task>("/tasks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
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
      qc.setQueriesData<TasksResponse>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((t) =>
            t.id === updated.id ? { ...t, ...updated } : t
          ),
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

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueriesData<TasksResponse>({ queryKey: ["tasks"] });
      qc.setQueriesData<TasksResponse>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
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
