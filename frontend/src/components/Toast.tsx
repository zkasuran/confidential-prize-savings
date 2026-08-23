import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "loading";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((message: string, type: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "info") {
  addToastFn?.(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message: string, type: ToastType) => {
      const id = ++toastId;
      setToasts((t) => [...t, { id, message, type }]);
      if (type !== "loading") {
        setTimeout(() => {
          setToasts((t) => t.filter((item) => item.id !== id));
        }, 4000);
      }
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  const dismiss = (id: number) => {
    setToasts((t) => t.filter((item) => item.id !== id));
  };

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✗",
    info: "ℹ",
    loading: "⟳",
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">{icons[t.type]}</span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
