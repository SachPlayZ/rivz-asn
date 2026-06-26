"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

type QuickCaptureContextType = {
  open: boolean;
  openCapture: () => void;
  closeCapture: () => void;
};

const QuickCaptureContext = createContext<QuickCaptureContextType>({
  open: false,
  openCapture: () => {},
  closeCapture: () => {},
});

export function useQuickCapture() {
  return useContext(QuickCaptureContext);
}

export function QuickCaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openCapture = useCallback(() => setOpen(true), []);
  const closeCapture = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;
      // Option/Alt + N key
      if (
        (e.code === "KeyN" || e.key.toLowerCase() === "n" || e.key === "˜") &&
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <QuickCaptureContext.Provider value={{ open, openCapture, closeCapture }}>
      {children}
    </QuickCaptureContext.Provider>
  );
}
