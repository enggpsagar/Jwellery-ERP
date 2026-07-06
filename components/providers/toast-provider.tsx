"use client";

import * as React from "react";

type ToastType = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextType = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = React.createContext<ToastContextType | null>(null);

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = React.useCallback(
    (type: ToastType, message: string) => {
      const id = generateId();

      setToasts((prev) => [...prev, { id, type, message }]);

      setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast]
  );

  const value = React.useMemo(
    () => ({
      success: (message: string) =>
        addToast("success", message),

      error: (message: string) =>
        addToast("error", message),

      info: (message: string) =>
        addToast("info", message),

      warning: (message: string) =>
        addToast("warning", message),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed top-5 left-1/2 z-[9999] flex w-full max-w-md -translate-x-1/2 flex-col gap-3 px-4">
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const styles = {
    success:
      "border-green-200 bg-green-50 text-green-800",

    error:
      "border-red-200 bg-red-50 text-red-800",

    info:
      "border-blue-200 bg-blue-50 text-blue-800",

    warning:
      "border-yellow-200 bg-yellow-50 text-yellow-800",
  };

  return (
    <div
      className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg transition-all ${styles[toast.type]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">
          {toast.message}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="text-sm opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error(
      "useToast must be used inside ToastProvider"
    );
  }

  return context;
}