import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TelegramLinkStatus = {
  linked: boolean;
  username?: string;
  bot_url?: string;
  code?: string;
};

export type TelegramLinkCode = {
  code: string;
  bot_url: string;
};

/** Returns the current Telegram link status for the authenticated user. */
export function useTelegramLink() {
  return useQuery<TelegramLinkStatus>({
    queryKey: ["telegram", "link"],
    queryFn: () => api.get<TelegramLinkStatus>("/telegram/link"),
    retry: false,
  });
}

/** Generates a one-time link code + bot URL. */
export function useLinkTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TelegramLinkCode>("/telegram/link", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram", "link"] });
    },
  });
}

/** Removes the Telegram link for the authenticated user. */
export function useUnlinkTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("/telegram/link"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram", "link"] });
    },
  });
}
