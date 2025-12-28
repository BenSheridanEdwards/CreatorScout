import type { Screenshot } from "../../types";

interface ScreenshotModalProps {
	screenshot: Screenshot;
	onClose: () => void;
}

export default function ScreenshotModal({
	screenshot,
	onClose,
}: ScreenshotModalProps) {
	return (
		<div
			className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
			onClick={onClose}
		>
			<div
				className="bg-slate-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-auto"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold text-slate-200">
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
							<span className="text-xs text-slate-400">
								{new Date(screenshot.date).toLocaleString()}
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						type="button"
						className="text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center"
					>
						×
					</button>
				</div>
				<div className="p-4">
					<img
						src={`http://localhost:4000${screenshot.path}`}
						alt={screenshot.username}
						className="w-full rounded-lg"
					/>
				</div>
			</div>
		</div>
	);
}

