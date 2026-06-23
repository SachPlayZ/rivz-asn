"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type NotifPrefs = {
  in_app: boolean;
  email: boolean;
  web_push: boolean;
  chat: boolean;
};

export type Me = {
  id: string;
  email: string;
  role: string;
  theme: string;
  digest_enabled: boolean;
  notif_prefs: NotifPrefs;
  notif_chat_url: string | null;
  notif_chat_kind: string | null;
  inbox_token: string | null;
};

const DEFAULT_PREFS: NotifPrefs = {
  in_app: true,
  email: false,
  web_push: true,
  chat: false,
};

/** Current user incl. notification preferences. */
export function useMe() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => {
      const m = await api.get<Me>("/auth/me");
      return { ...m, notif_prefs: { ...DEFAULT_PREFS, ...(m.notif_prefs ?? {}) } };
    },
  });
}

export type PreferencesPatch = {
  theme?: string;
  digest_enabled?: boolean;
  notif_prefs?: NotifPrefs;
  notif_chat_url?: string;
  notif_chat_kind?: string;
};

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: PreferencesPatch) =>
      api.patch<void>("/auth/me/preferences", prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

// ─── Web push subscription ──────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Whether the browser currently holds a push subscription. */
export function usePushState() {
  return useQuery<{ supported: boolean; subscribed: boolean; permission: NotificationPermission }>({
    queryKey: ["push-state"],
    queryFn: async () => {
      if (!pushSupported()) {
        return { supported: false, subscribed: false, permission: "denied" as NotificationPermission };
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return {
        supported: true,
        subscribed: !!sub,
        permission: Notification.permission,
      };
    },
  });
}

export function useEnablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!pushSupported()) throw new Error("Push not supported in this browser");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission denied");

      const { public_key } = await api.get<{ public_key: string }>("/push/public-key");
      if (!public_key) throw new Error("Web push is not configured on the server");

      const reg = await navigator.serviceWorker.ready;
      // Clear any stale subscription (different VAPID key from a previous deploy/session).
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
      const json = sub.toJSON();
      await api.post<void>("/push/subscribe", {
        endpoint: json.endpoint,
        keys: json.keys,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["push-state"] }),
  });
}

export function useDisablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!pushSupported()) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await api
        .delete<void>(`/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
        .catch(() => {});
      await sub.unsubscribe();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["push-state"] }),
  });
}
