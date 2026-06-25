import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type PomodoroSession = {
  id: string;
  task_id: string | null;
  user_id: string;
  duration_minutes: number;
  completed: boolean;
  started_at: string;
  ended_at: string | null;
};

export function useActivePomodoro() {
  return useQuery<PomodoroSession | null>({
    queryKey: ["pomodoro", "active"],
    queryFn: async () => {
      try {
        return await api.get<PomodoroSession>("/pomodoro/active");
      } catch {
        return null;
      }
    },
    refetchInterval: 30_000,
  });
}

export function useStartPomodoro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { task_id?: string; duration_minutes?: number }) =>
      api.post<PomodoroSession>("/pomodoro/start", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pomodoro", "active"] });
      qc.invalidateQueries({ queryKey: ["pomodoro", "history"] });
    },
  });
}

export function useCompletePomodoro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<PomodoroSession>(`/pomodoro/${id}/complete`, {}),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ["pomodoro", "active"] });
      qc.invalidateQueries({ queryKey: ["pomodoro", "history"] });
      // Invalidate task queries so total_time_seconds updates immediately.
      if (session.task_id) {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["task", session.task_id] });
      }
    },
  });
}

export function useAbandonPomodoro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<PomodoroSession>(`/pomodoro/${id}/abandon`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pomodoro", "active"] });
      qc.invalidateQueries({ queryKey: ["pomodoro", "history"] });
    },
  });
}

export function usePomodoroHistory() {
  return useQuery<PomodoroSession[]>({
    queryKey: ["pomodoro", "history"],
    queryFn: () => api.get<PomodoroSession[]>("/pomodoro/history"),
  });
}
