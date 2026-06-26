import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type FocusSession = {
  id: string;
  user_id: string;
  task_id: string | null;
  task_title: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  notes: string;
  intention: string;
  created_at: string;
  updated_at: string;
};

export type FocusStats = {
  total_sessions: number;
  total_minutes: number;
  current_streak: number;
  longest_streak: number;
};

export type FocusListResult = {
  data: FocusSession[];
  page: number;
  limit: number;
  total: number;
};

export function useActiveFocusSession() {
  return useQuery<FocusSession | null>({
    queryKey: ["focus", "active"],
    queryFn: async () => {
      const res = await api.get<{ session: FocusSession | null }>("/focus/active");
      return res.session;
    },
    refetchInterval: 30_000,
  });
}

export function useFocusHistory(page = 1, limit = 20) {
  return useQuery<FocusListResult>({
    queryKey: ["focus", "history", page, limit],
    queryFn: () =>
      api.get<FocusListResult>(`/focus/history?page=${page}&limit=${limit}`),
  });
}

export function useFocusStats() {
  return useQuery<FocusStats>({
    queryKey: ["focus", "stats"],
    queryFn: () => api.get<FocusStats>("/focus/stats"),
  });
}

export function useStartFocusSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { task_id?: string; intention?: string }) =>
      api.post<FocusSession>("/focus/start", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["focus"] });
    },
  });
}

export function useEndFocusSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { notes?: string }) =>
      api.post<FocusSession>("/focus/end", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["focus"] });
    },
  });
}

export function useDeleteFocusSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/focus/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["focus"] });
    },
  });
}
