// =============================================================================
// Toast (brief §2.2). Implementazione senza dipendenze esterne: un context
// provider espone `useToast()` -> { toast, dismiss }, con annunci ARIA live
// e auto-dismiss configurabile.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@pv/lib/utils";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  kind?: ToastKind;
  /** Millisecondi prima dell'auto-dismiss; 0 = resta finche' non chiuso. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  durationMs: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_ICONS: Record<ToastKind, ReactNode> = {
  info: <Info className="h-5 w-5 text-pv-cyan" aria-hidden="true" />,
  success: <CheckCircle2 className="h-5 w-5 text-pv-success" aria-hidden="true" />,
  warning: <AlertTriangle className="h-5 w-5 text-pv-warning" aria-hidden="true" />,
  error: <XCircle className="h-5 w-5 text-pv-error" aria-hidden="true" />,
};

const KIND_BORDERS: Record<ToastKind, string> = {
  info: "border-pv-cyan/30",
  success: "border-pv-success/30",
  warning: "border-pv-warning/30",
  error: "border-pv-error/30",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const item: ToastItem = {
        id,
        kind: options.kind ?? "info",
        durationMs: options.durationMs ?? 5000,
        ...options,
      };
      setToasts((current) => [...current, item]);
      if (item.durationMs > 0) {
        setTimeout(() => dismiss(id), item.durationMs);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        >
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-pv-card p-4 shadow-pv-card animate-fade-in",
                KIND_BORDERS[item.kind],
              )}
            >
              {KIND_ICONS[item.kind]}
              <div className="flex-1">
                <p className="text-sm font-semibold text-pv-ink">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-sm text-pv-ink-2">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Chiudi notifica"
                className="rounded-lg p-1 text-pv-ink-3 transition-colors hover:bg-pv-hover hover:text-pv-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve essere usato dentro <ToastProvider>");
  }
  return context;
}
