"use client";

import { createContext, useCallback, useContext, useState, useRef, ReactNode } from "react";

type ToastType = "success" | "error";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void };
  duration: number;
}

type ShowToast = (msg: string, typeOrOpts?: ToastType | { type?: ToastType; action?: { label: string; onClick: () => void }; duration?: number }) => void;

const Ctx = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(Ctx);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const show: ShowToast = useCallback((message, typeOrOpts) => {
    const id = nextId++;
    let type: ToastType = "success";
    let action: Toast["action"] = undefined;
    let duration = 3500;

    if (typeof typeOrOpts === "string") {
      type = typeOrOpts;
    } else if (typeOrOpts && typeof typeOrOpts === "object") {
      type = typeOrOpts.type || "success";
      action = typeOrOpts.action;
      duration = typeOrOpts.duration || (action ? 8000 : 3500);
    }

    setToasts((t) => [...t, { id, message, type, action, duration }]);
    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timersRef.current.delete(id);
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-full px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-2xl text-sm text-white flex items-center justify-between gap-3 ${
              t.type === "error" ? "bg-red-600" : "bg-gray-800"
            }`}
            style={{ animation: "slideDown 0.2s ease-out" }}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className="shrink-0 px-3 py-1 text-xs font-bold rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Ctx.Provider>
  );
}
