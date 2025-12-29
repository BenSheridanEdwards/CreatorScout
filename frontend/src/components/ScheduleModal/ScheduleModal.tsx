import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import ScheduleForm from "../ScheduleForm/ScheduleForm";
import type { ScheduledRun } from "../../types";

interface ScheduleModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	schedule?: ScheduledRun; // For edit mode
	onSuccess?: () => void;
}

export default function ScheduleModal({
	open,
	onOpenChange,
	schedule,
	onSuccess,
}: ScheduleModalProps) {
	const handleSuccess = () => {
		onOpenChange(false);
		if (onSuccess) {
			onSuccess();
		}
	};

	const handleCancel = () => {
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-2 border-sky-500/30 shadow-2xl shadow-sky-500/10 backdrop-blur-xl p-0">
				<DialogHeader className="border-b border-sky-500/20 px-6 pt-6 pb-5">
					<DialogTitle className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-sky-400 to-cyan-300 uppercase tracking-wide">
						{schedule ? "Edit Schedule" : "Schedule New Run"}
					</DialogTitle>
					<DialogDescription className="text-sm text-slate-400 mt-2">
						{schedule
							? "Update the scheduled run details below."
							: "Create a new scheduled run by selecting a profile, script, and time."}
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pb-6">
					<ScheduleForm
						schedule={schedule}
						onSuccess={handleSuccess}
						onCancel={handleCancel}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
