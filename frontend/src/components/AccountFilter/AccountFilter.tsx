import { useEffect, useState } from "react";

interface AccountFilterProps {
	onAccountChange: (account: string) => void;
}

export default function AccountFilter({ onAccountChange }: AccountFilterProps) {
	const [accounts, setAccounts] = useState<string[]>(["all"]);
	const [selectedAccount, setSelectedAccount] = useState<string>("all");

	useEffect(() => {
		// Load accounts from localStorage or fetch from API
		const saved = localStorage.getItem("selectedAccount");
		if (saved) {
			setSelectedAccount(saved);
			onAccountChange(saved);
		}

		// Fetch available accounts from scheduled runs
		async function loadAccounts() {
			try {
				const res = await fetch("/api/schedule");
				if (res.ok) {
					const scheduled = (await res.json()) as Array<{ profileId: string }>;
					const uniqueAccounts = [
						"all",
						...new Set(scheduled.map((s) => s.profileId)),
					];
					setAccounts(uniqueAccounts);
				} else if (res.status !== 404) {
					console.warn("Failed to load accounts:", res.status);
				}
				// 404 is OK - means no schedule endpoint
			} catch (error) {
				console.warn(
					"Schedule endpoint not available for account loading:",
					error,
				);
				// Continue with default "all" option
			}
		}

		void loadAccounts();
	}, [onAccountChange]);

	const handleChange = (account: string) => {
		setSelectedAccount(account);
		localStorage.setItem("selectedAccount", account);
		onAccountChange(account);
	};

	return (
		<div className="flex items-center gap-2">
			<label htmlFor="account-select" className="text-xs text-slate-400">
				Account:
			</label>
			<select
				id="account-select"
				value={selectedAccount}
				onChange={(e) => handleChange(e.target.value)}
				className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
			>
				{accounts.map((account) => (
					<option key={account} value={account}>
						{account}
					</option>
				))}
			</select>
		</div>
	);
}
