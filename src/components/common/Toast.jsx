import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// Toast Context
const ToastContext = createContext(null);

// Toast variants with icons and colors
const VARIANTS = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-emerald-600',
    border: 'border-emerald-700',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-600',
    border: 'border-red-700',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-500',
    border: 'border-amber-600',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-600',
    border: 'border-blue-700',
  },
};

// Individual Toast Component
function ToastItem({ id, title, description, variant = 'info', onDismiss }) {
  const config = VARIANTS[variant] || VARIANTS.info;
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 4000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={`${config.bg} ${config.border} border text-white rounded-lg shadow-lg p-4 min-w-[320px] max-w-[420px] animate-slide-in flex items-start gap-3`}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm">{title}</p>}
        {description && <p className="text-sm opacity-90 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Toast Container Component
function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Toast Provider Component
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(({ title, description, variant = 'info' }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, description, variant }]);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// Custom Hook
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
