export async function runNativeUpdate(options) {
	const {
		projectRoot,
		updater,
		write,
		ask,
		launch,
		nodePath = process.execPath,
	} = options;

	write("");
	write("UGK Mini Agent Update");
	write("=====================");
	write(`Project: ${projectRoot}`);
	write("Updating from origin/main...");

	const result = await updater.applyUpdate();
	if (!result.ok) {
		write("");
		write(result.message);
		if (result.blockingChanges.length > 0) {
			write("");
			write("Blocking local changes:");
			for (const change of result.blockingChanges) {
				write(`  ${change}`);
			}
		}
		if (result.allowedLocalArtifacts.length > 0) {
			write("");
			write("Allowed runtime artifacts:");
			for (const artifact of result.allowedLocalArtifacts) {
				write(`  ${artifact}`);
			}
		}
		write("");
		write("Update stopped. Your files were not changed.");
		return 1;
	}

	write("");
	for (const command of result.log) {
		write(`Ran: ${command}`);
	}
	if (result.updated) {
		write(`Updated to ${result.currentShortCommit}.`);
	} else {
		write("Already up to date.");
	}
	if (result.npmInstallRan) {
		write("Root dependencies were installed.");
	}
	if (result.teamConsoleInstallRan) {
		write("Team Console dependencies were installed.");
	}

	const answer = await ask("Restart UGK Mini Agent now? [Y/n] ");
	if (isNo(answer)) {
		write("");
		write("Restart skipped. You can start later with the launcher script.");
		return 0;
	}

	write("");
	write("Restarting UGK Mini Agent...");
	const launchCode = await launch(nodePath, ["scripts/native-launcher.mjs"]);
	return launchCode;
}

function isNo(answer) {
	const normalized = String(answer ?? "").trim().toLowerCase();
	return normalized === "n" || normalized === "no";
}
