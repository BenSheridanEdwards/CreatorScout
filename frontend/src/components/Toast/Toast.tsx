import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number; // milliseconds, default 5000
}

interface ToastProps {
	toast: Toast;
	onDismiss: (id: string) => void;
}

function ToastComponent({ toast, onDismiss }: ToastProps) {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		// Trigger fade-in animation
		setIsVisible(true);

		// Auto-dismiss
		const timer = setTimeout(() => {
			setIsVisible(false);
			setTimeout(() => onDismiss(toast.id), 300); // Wait for fade-out
		}, toast.duration || 5000);

		return () => clearTimeout(timer);
	}, [toast.id, toast.duration, onDismiss]);

	const typeStyles = {
		success: "bg-emerald-500/90 border-emerald-400 text-emerald-50",
		error: "bg-red-500/90 border-red-400 text-red-50",
		info: "bg-sky-500/90 border-sky-400 text-sky-50",
		warning: "bg-amber-500/90 border-amber-400 text-amber-50",
	};

	const icons = {
		success: "✓",
		error: "✗",
		info: "ℹ",
		warning: "⚠",
	};

	return (
		<div
			className={`min-w-[300px] max-w-md rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 ${
				isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"
			} ${typeStyles[toast.type]}`}
			role="alert"
		>
			<div className="flex items-start gap-3">
				<span className="text-lg font-bold flex-shrink-0">
					{icons[toast.type]}
				</span>
				<p className="flex-1 text-sm font-medium">{toast.message}</p>
				<button
					type="button"
					onClick={() => {
						setIsVisible(false);
						setTimeout(() => onDismiss(toast.id), 300);
					}}
					className="flex-shrink-0 text-current/70 hover:text-current transition"
					aria-label="Dismiss"
				>
					×
				</button>
			</div>
		</div>
	);
}

interface ToastContainerProps {
	toasts: Toast[];
	onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
	if (toasts.length === 0) return null;

	return (
		<div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastComponent toast={toast} onDismiss={onDismiss} />
				</div>
			))}
		</div>
	);
}

// Hook for managing toasts
export function useToast() {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const showToast = (
		message: string,
		type: ToastType = "info",
		duration?: number,
	) => {
		const id = `toast-${Date.now()}-${Math.random()}`;
		const newToast: Toast = { id, message, type, duration };
		setToasts((prev) => [...prev, newToast]);
		return id;
	};

	const dismissToast = (id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	};

	const success = (message: string, duration?: number) =>
		showToast(message, "success", duration);
	const error = (message: string, duration?: number) =>
		showToast(message, "error", duration);
	const info = (message: string, duration?: number) =>
		showToast(message, "info", duration);
	const warning = (message: string, duration?: number) =>
		showToast(message, "warning", duration);

	return {
		toasts,
		showToast,
		dismissToast,
		success,
		error,
		info,
		warning,
	};
}


