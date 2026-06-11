"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * useSSE connects to the backend's SSE endpoint using the JWT token from
 * localStorage. On each event it invalidates the tasks query so the UI
 * re-fetches fresh data. Reconnects automatically after a 3-second delay
 * if the connection drops. Cleans up on unmount.
 */
export function useSSE() {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;

      const url = `${BASE_URL}/events?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["activity", "global"] });
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!destroyed) {
          timerRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [qc]);
}
