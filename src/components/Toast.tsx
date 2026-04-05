'use client';

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { ToastContext, useToastProvider } from "../hooks/useToast";
import type { Toast as ToastType } from "../hooks/useToast";

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const toastValue = useToastProvider();

  return (
    <ToastContext.Provider value={toastValue}>
      {children}
      <ToastContainer toasts={toastValue.toasts} onDismiss={toastValue.dismiss} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const accentColor = {
    error: "#ef4444",
    success: "#fff",
    info: "#999",
  }[toast.type];

  const Icon = {
    error: XIcon,
    success: CheckIcon,
    info: InfoIcon,
  }[toast.type];

  return (
    <div
      className={`
        flex items-center gap-3 min-w-[280px] max-w-[400px]
        transition-all duration-300 ease-out
        ${isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
      style={{
        background: "black",
        border: "1px solid #555",
        borderLeft: `2px solid ${accentColor}`,
        padding: "0.625rem 0.75rem",
      }}
      role="alert"
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
      <p
        style={{
          flex: 1,
          fontSize: "0.75rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "white",
        }}
      >
        {toast.message}
      </p>
      {toast.action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          style={{
            flexShrink: 0,
            fontSize: "0.6875rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "white",
            border: "1px solid white",
            background: "transparent",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            transition: "background-color 150ms, color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "white";
            e.currentTarget.style.color = "black";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "white";
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 transition-colors"
        style={{ padding: "0.25rem", color: "#777" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "white"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#777"; }}
        aria-label="Dismiss"
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Simple SVG icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
