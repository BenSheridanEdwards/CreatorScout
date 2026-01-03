import { useEffect, useRef } from "react";
import type { Screenshot } from "../../types";
import { getImageUrl } from "../../utils/imageUrl";

interface ScreenshotModalProps {
	screenshot: Screenshot;
	onClose: () => void;
}

export default function ScreenshotModal({
	screenshot,
	onClose,
}: ScreenshotModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog && typeof dialog.showModal === "function") {
			dialog.showModal();
			const handleEscape = (e: Event) => {
				if ((e as KeyboardEvent).key === "Escape") {
					onClose();
				}
			};
			dialog.addEventListener("cancel", handleEscape);
			return () => {
				dialog.removeEventListener("cancel", handleEscape);
			};
		}
	}, [onClose]);

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		if (e.target === dialogRef.current) {
			onClose();
		}
	};

	const handleBackdropKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
		if (e.key === "Escape" && e.target === dialogRef.current) {
			onClose();
		}
	};

	return (
		<dialog
			ref={dialogRef}
			className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop:bg-black/90"
			onClick={handleBackdropClick}
			onKeyDown={handleBackdropKeyDown}
			aria-modal="true"
			aria-labelledby="screenshot-modal-title"
		>
			<div className="bg-slate-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-auto">
				<header className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
					<div>
						<h3
							id="screenshot-modal-title"
							className="text-lg font-semibold text-slate-200"
						>
							@{screenshot.username}
						</h3>
						<div className="flex items-center gap-2 mt-1">
							<span
								className={`text-xs px-2 py-0.5 rounded ${
									screenshot.type === "profile"
										? "bg-emerald-500/20 text-emerald-300"
										: screenshot.type === "link"
											? "bg-purple-500/20 text-purple-300"
											: "bg-slate-700 text-slate-400"
								}`}
							>
								{screenshot.type}
							</span>
							<time
								dateTime={screenshot.date}
								className="text-xs text-slate-400"
							>
								{new Date(screenshot.date).toLocaleString()}
							</time>
						</div>
					</div>
					<button
						onClick={onClose}
						type="button"
						className="text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center"
						aria-label="Close screenshot modal"
					>
						×
					</button>
				</header>
				<div className="p-4">
					<img
						src={getImageUrl(screenshot.path)}
						alt={screenshot.username}
						className="w-full rounded-lg"
					/>
				</div>
			</div>
		</dialog>
	);
}
