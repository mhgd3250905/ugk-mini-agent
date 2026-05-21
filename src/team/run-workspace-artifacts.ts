import path from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class RunArtifactStore {
	constructor(private readonly rootDir: string) {}

	async writeFinalReport(runId: string, content: string): Promise<string> {
		const filePath = join(this.rootDir, "runs", runId, "final-report.md");
		await writeFile(filePath, content, "utf8");
		return "final-report.md";
	}

	async readFinalReport(runId: string): Promise<string | null> {
		try {
			return await readFile(join(this.rootDir, "runs", runId, "final-report.md"), "utf8");
		} catch {
			return null;
		}
	}

	async removeFinalReport(runId: string): Promise<void> {
		await rm(join(this.rootDir, "runs", runId, "final-report.md"), { force: true });
	}

	async readRunScopedFile(runId: string, ref: string): Promise<string | null> {
		if (/[^a-zA-Z0-9_-]/.test(runId) || runId.includes("..")) return null;
		const runRoot = join(this.rootDir, "runs", runId);
		const normalized = ref.trim().replace(/^["'`]+|["'`,.;:，。；：）)]+$/g, "").replace(/\\/g, "/");
		const appPrefix = `/app/.data/team/runs/${runId}/`;
		const runsPrefix = `runs/${runId}/`;
		let relative: string | null = null;
		if (normalized.startsWith(appPrefix)) {
			relative = normalized.slice(appPrefix.length);
		} else if (normalized.startsWith(runsPrefix)) {
			relative = normalized.slice(runsPrefix.length);
		} else if (!normalized.startsWith("/") && !/^[a-zA-Z]:\//.test(normalized)) {
			relative = normalized;
		}
		if (!relative || relative.includes("..")) return null;
		const filePath = join(runRoot, ...relative.split("/").filter(Boolean));
		const resolved = path.resolve(filePath);
		const root = path.resolve(runRoot);
		if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
		try { return await readFile(filePath, "utf8"); } catch { return null; }
	}
}
