import { randomUUID } from "node:crypto";
import { ConnDatabase } from "./conn-db.js";
import {
	computeNextCronOccurrence,
	computeNextRunAt,
	type ConnDefinition,
	type ConnExecution,
	type ConnSchedule,
	type ConnStatus,
	type ConnTarget,
	type ConnUpgradePolicy,
	normalizeConnTimeZone,
} from "./conn-store.js";

export interface ConnSqliteStoreOptions {
	database: ConnDatabase;
}

export interface CreateConnInput {
	title: string;
	prompt: string;
	target: ConnTarget;
	schedule: ConnSchedule;
	execution?: ConnExecution;
	assetRefs?: string[];
	maxRunMs?: number;
	profileId?: string;
	agentSpecId?: string;
	skillSetId?: string;
	modelPolicyId?: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy?: ConnUpgradePolicy;
	publicSiteId?: string;
	artifactDelivery?: import("./artifact-contract.js").ArtifactDeliveryConfig;
	now?: Date;
}

export type UpdateConnInput = Partial<
	Pick<
		ConnDefinition,
		| "title"
		| "prompt"
		| "target"
		| "schedule"
		| "execution"
		| "assetRefs"
		| "maxRunMs"
		| "profileId"
		| "agentSpecId"
		| "skillSetId"
		| "modelPolicyId"
		| "modelProvider"
		| "modelId"
		| "upgradePolicy"
		| "publicSiteId"
		| "artifactDelivery"
		| "status"
	>
> & { now?: Date };

export interface DeleteManyConnsResult {
	deletedConnIds: string[];
	missingConnIds: string[];
}

interface ConnRow {
	conn_id: string;
	title: string;
	prompt: string;
	target_json: string;
	schedule_json: string;
	execution_json?: string | null;
	asset_refs_json: string;
	max_run_ms?: number | null;
	profile_id: string;
	agent_spec_id: string;
	skill_set_id: string;
	model_policy_id: string;
	model_provider?: string | null;
	model_id?: string | null;
	upgrade_policy: ConnUpgradePolicy;
	public_site_id?: string | null;
	artifact_delivery_json?: string | null;
	status: ConnStatus;
	created_at: string;
	updated_at: string;
	last_run_at?: string;
	next_run_at?: string;
	last_run_id?: string;
	deleted_at?: string | null;
}

const DEFAULT_PROFILE_ID = "background.default";
const DEFAULT_AGENT_SPEC_ID = "agent.default";
const DEFAULT_SKILL_SET_ID = "skills.default";
const DEFAULT_MODEL_POLICY_ID = "model.default";
const DEFAULT_UPGRADE_POLICY: ConnUpgradePolicy = "latest";
const DEFAULT_EXECUTION: ConnExecution = { type: "agent_prompt" };

export class ConnSqliteStore {
	constructor(private readonly options: ConnSqliteStoreOptions) {}

	async list(): Promise<ConnDefinition[]> {
		const rows = this.options.database.all<ConnRow>(
			"SELECT * FROM conns WHERE deleted_at IS NULL ORDER BY created_at DESC, conn_id DESC",
		);
		return rows.flatMap((row) => {
			const conn = tryRowToConnDefinition(row);
			return conn ? [conn] : [];
		});
	}

	async get(connId: string): Promise<ConnDefinition | undefined> {
		const row = this.options.database.get<ConnRow>(
			"SELECT * FROM conns WHERE conn_id = ? AND deleted_at IS NULL",
			connId,
		);
		return row ? tryRowToConnDefinition(row) : undefined;
	}

	async create(input: CreateConnInput): Promise<ConnDefinition> {
		const now = input.now ?? new Date();
		const createdAt = now.toISOString();
		const schedule = normalizeSchedule(input.schedule, now);
		const conn: ConnDefinition = {
			connId: randomUUID(),
			title: input.title.trim(),
			prompt: input.prompt.trim(),
			target: input.target,
			schedule,
			execution: normalizeExecution(input.execution),
			assetRefs: normalizeAssetRefs(input.assetRefs),
			...(input.maxRunMs !== undefined ? { maxRunMs: normalizeMaxRunMs(input.maxRunMs) } : {}),
			profileId: normalizeOptionalId(input.profileId) ?? DEFAULT_PROFILE_ID,
			agentSpecId: normalizeOptionalId(input.agentSpecId) ?? DEFAULT_AGENT_SPEC_ID,
			skillSetId: normalizeOptionalId(input.skillSetId) ?? DEFAULT_SKILL_SET_ID,
			modelPolicyId: normalizeOptionalId(input.modelPolicyId) ?? DEFAULT_MODEL_POLICY_ID,
			...(input.modelProvider !== undefined ? { modelProvider: normalizeRequiredId(input.modelProvider, "modelProvider") } : {}),
			...(input.modelId !== undefined ? { modelId: normalizeRequiredId(input.modelId, "modelId") } : {}),
			upgradePolicy: input.upgradePolicy ?? DEFAULT_UPGRADE_POLICY,
			...(input.publicSiteId !== undefined ? { publicSiteId: normalizePublicSiteId(input.publicSiteId) } : {}),
			...(input.artifactDelivery ? { artifactDelivery: input.artifactDelivery } : {}),
			status: "active",
			createdAt,
			updatedAt: createdAt,
			nextRunAt: computeNextRunAt(schedule, undefined, now)?.toISOString(),
		};

		this.options.database.run(
			[
				"INSERT INTO conns (",
				"conn_id, title, prompt, target_json, schedule_json, execution_json, asset_refs_json, max_run_ms,",
				"profile_id, agent_spec_id, skill_set_id, model_policy_id, model_provider, model_id, upgrade_policy, public_site_id, artifact_delivery_json,",
				"status, created_at, updated_at, next_run_at",
				") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			].join(" "),
			conn.connId,
			conn.title,
			conn.prompt,
			JSON.stringify(conn.target),
			JSON.stringify(conn.schedule),
			JSON.stringify(conn.execution),
			JSON.stringify(conn.assetRefs),
			conn.maxRunMs,
			conn.profileId,
			conn.agentSpecId,
			conn.skillSetId,
			conn.modelPolicyId,
			conn.modelProvider,
			conn.modelId,
			conn.upgradePolicy,
			conn.publicSiteId,
			JSON.stringify(conn.artifactDelivery) ?? null,
			conn.status,
			conn.createdAt,
			conn.updatedAt,
			conn.nextRunAt,
		);

		return conn;
	}

	async update(connId: string, patch: UpdateConnInput): Promise<ConnDefinition | undefined> {
		const existing = await this.get(connId);
		if (!existing) {
			return undefined;
		}

		const now = patch.now ?? new Date();
		const schedule = patch.schedule ? normalizeSchedule(patch.schedule, now) : existing.schedule;
		const status = patch.status ?? existing.status;
		const updated: ConnDefinition = {
			...existing,
			...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
			...(patch.prompt !== undefined ? { prompt: patch.prompt.trim() } : {}),
			...(patch.target !== undefined ? { target: patch.target } : {}),
			...(patch.schedule !== undefined ? { schedule } : {}),
			...(patch.execution !== undefined ? { execution: normalizeExecution(patch.execution) } : {}),
			...(patch.assetRefs !== undefined ? { assetRefs: normalizeAssetRefs(patch.assetRefs) } : {}),
			...(patch.maxRunMs !== undefined ? { maxRunMs: normalizeMaxRunMs(patch.maxRunMs) } : {}),
			...(patch.profileId !== undefined ? { profileId: normalizeRequiredId(patch.profileId, "profileId") } : {}),
			...(patch.agentSpecId !== undefined ? { agentSpecId: normalizeRequiredId(patch.agentSpecId, "agentSpecId") } : {}),
			...(patch.skillSetId !== undefined ? { skillSetId: normalizeRequiredId(patch.skillSetId, "skillSetId") } : {}),
			...(patch.modelPolicyId !== undefined ? { modelPolicyId: normalizeRequiredId(patch.modelPolicyId, "modelPolicyId") } : {}),
			...(patch.modelProvider !== undefined ? { modelProvider: normalizeRequiredId(patch.modelProvider, "modelProvider") } : {}),
			...(patch.modelId !== undefined ? { modelId: normalizeRequiredId(patch.modelId, "modelId") } : {}),
			...(patch.upgradePolicy !== undefined ? { upgradePolicy: patch.upgradePolicy } : {}),
			...(patch.publicSiteId !== undefined ? { publicSiteId: normalizePublicSiteId(patch.publicSiteId) } : {}),
			...(patch.artifactDelivery !== undefined ? { artifactDelivery: patch.artifactDelivery } : {}),
			status,
			updatedAt: now.toISOString(),
			nextRunAt:
				status === "active"
					? computeNextRunAt(schedule, existing.lastRunAt ? new Date(existing.lastRunAt) : undefined, now)?.toISOString()
					: undefined,
		};

		this.options.database.run(
			[
				"UPDATE conns SET",
				"title = ?, prompt = ?, target_json = ?, schedule_json = ?, execution_json = ?, asset_refs_json = ?, max_run_ms = ?,",
				"profile_id = ?, agent_spec_id = ?, skill_set_id = ?, model_policy_id = ?, model_provider = ?, model_id = ?, upgrade_policy = ?, public_site_id = ?, artifact_delivery_json = ?,",
				"status = ?, updated_at = ?, next_run_at = ?",
				"WHERE conn_id = ?",
			].join(" "),
			updated.title,
			updated.prompt,
			JSON.stringify(updated.target),
			JSON.stringify(updated.schedule),
			JSON.stringify(updated.execution),
			JSON.stringify(updated.assetRefs),
			updated.maxRunMs,
			updated.profileId,
			updated.agentSpecId,
			updated.skillSetId,
			updated.modelPolicyId,
			updated.modelProvider,
			updated.modelId,
			updated.upgradePolicy,
			updated.publicSiteId,
			JSON.stringify(updated.artifactDelivery) ?? null,
			updated.status,
			updated.updatedAt,
			updated.nextRunAt,
			updated.connId,
		);

		return updated;
	}

	async delete(connId: string): Promise<boolean> {
		const result = await this.deleteMany([connId]);
		return result.deletedConnIds.includes(connId);
	}

	async deleteMany(connIds: readonly string[]): Promise<DeleteManyConnsResult> {
		const uniqueConnIds = Array.from(
			new Set(connIds.map((connId) => connId.trim()).filter((connId) => connId.length > 0)),
		);
		const result: DeleteManyConnsResult = {
			deletedConnIds: [],
			missingConnIds: [],
		};
		if (uniqueConnIds.length === 0) {
			return result;
		}

		try {
			this.options.database.exec("BEGIN IMMEDIATE");
			for (const connId of uniqueConnIds) {
				const existing = this.options.database.get<Pick<ConnRow, "conn_id">>(
					"SELECT conn_id FROM conns WHERE conn_id = ? AND deleted_at IS NULL",
					connId,
				);
				if (!existing) {
					result.missingConnIds.push(connId);
					continue;
				}
				this.deleteConnReferences(connId);
				const deletedAt = new Date().toISOString();
				this.options.database.run(
					[
						"UPDATE conns SET",
						"status = 'completed', next_run_at = NULL, deleted_at = ?, updated_at = ?",
						"WHERE conn_id = ? AND deleted_at IS NULL",
					].join(" "),
					deletedAt,
					deletedAt,
					connId,
				);
				result.deletedConnIds.push(connId);
			}
			this.options.database.exec("COMMIT");
		} catch (error) {
			this.rollbackQuietly();
			throw error;
		}
		return result;
	}

	async pause(connId: string, now: Date = new Date()): Promise<ConnDefinition | undefined> {
		return await this.update(connId, { status: "paused", now });
	}

	async resume(connId: string, now: Date = new Date()): Promise<ConnDefinition | undefined> {
		return await this.update(connId, { status: "active", now });
	}

	private deleteConnReferences(connId: string): void {
		this.options.database.run("DELETE FROM agent_activity_items WHERE source = 'conn' AND source_id = ?", connId);
	}

	private rollbackQuietly(): void {
		try {
			this.options.database.exec("ROLLBACK");
		} catch {
			// SQLite may have already closed the transaction.
		}
	}
}

function rowToConnDefinition(row: ConnRow): ConnDefinition {
	return {
		connId: row.conn_id,
		title: row.title,
		prompt: row.prompt,
		target: parseJsonField<ConnTarget>(row.target_json, "target_json"),
		schedule: parseJsonField<ConnSchedule>(row.schedule_json, "schedule_json"),
		execution: parseExecutionJson(row.execution_json),
		assetRefs: parseJsonField<string[]>(row.asset_refs_json, "asset_refs_json"),
		...(typeof row.max_run_ms === "number" ? { maxRunMs: row.max_run_ms } : {}),
		profileId: row.profile_id,
		agentSpecId: row.agent_spec_id,
		skillSetId: row.skill_set_id,
		modelPolicyId: row.model_policy_id,
		...(row.model_provider ? { modelProvider: row.model_provider } : {}),
		...(row.model_id ? { modelId: row.model_id } : {}),
		upgradePolicy: row.upgrade_policy,
		...(row.public_site_id ? { publicSiteId: row.public_site_id } : {}),
		...(row.artifact_delivery_json && row.artifact_delivery_json !== "null" ? { artifactDelivery: JSON.parse(row.artifact_delivery_json) } : {}),
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
		...(row.next_run_at ? { nextRunAt: row.next_run_at } : {}),
		...(row.last_run_id ? { lastRunId: row.last_run_id } : {}),
	};
}

function tryRowToConnDefinition(row: ConnRow): ConnDefinition | undefined {
	try {
		return rowToConnDefinition(row);
	} catch (error) {
		if (isInvalidConnJsonError(error)) {
			return undefined;
		}
		throw error;
	}
}

function parseJsonField<T>(value: string, fieldName: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new Error(`Invalid JSON in conn database field ${fieldName}`);
	}
}

function parseExecutionJson(value: string | null | undefined): ConnExecution {
	if (!value || value === "null") {
		return DEFAULT_EXECUTION;
	}
	try {
		return normalizeExecution(JSON.parse(value) as ConnExecution);
	} catch {
		return DEFAULT_EXECUTION;
	}
}

function isInvalidConnJsonError(error: unknown): boolean {
	return error instanceof Error && /^Invalid JSON in conn database field /.test(error.message);
}

function normalizeSchedule(schedule: ConnSchedule, now: Date): ConnSchedule {
	if (schedule.kind === "once") {
		const timezone = normalizeConnTimeZone(schedule.timezone);
		if (!timezone) {
			throw new Error("Invalid conn schedule: once.timezone is invalid");
		}
		const at = parseScheduleDate(schedule.at, timezone, "Invalid conn schedule: once.at must be a valid date");
		if (at.getTime() <= now.getTime()) {
			throw new Error("Invalid conn schedule: once.at is in the past");
		}
		return {
			kind: "once",
			at: at.toISOString(),
			...(schedule.timezone ? { timezone } : {}),
		};
	}

	if (schedule.kind === "interval") {
		if (!Number.isFinite(schedule.everyMs)) {
			throw new Error("Invalid conn schedule: interval.everyMs must be finite");
		}
		const timezone = normalizeConnTimeZone(schedule.timezone);
		if (!timezone) {
			throw new Error("Invalid conn schedule: interval.timezone is invalid");
		}
		return {
			kind: "interval",
			everyMs: Math.max(60_000, Math.trunc(schedule.everyMs)),
			...(schedule.startAt
				? { startAt: parseScheduleDate(schedule.startAt, timezone, "Invalid conn schedule: interval.startAt must be a valid date").toISOString() }
				: {}),
			...(schedule.timezone ? { timezone } : {}),
		};
	}

	const expression = schedule.expression.trim();
	const timezone = normalizeConnTimeZone(schedule.timezone);
	if (!timezone) {
		throw new Error("Invalid conn schedule: cron.timezone is invalid");
	}
	if (!expression || !computeNextCronOccurrence(expression, now, timezone)) {
		throw new Error("Invalid conn schedule: cron.expression is invalid");
	}
	return {
		kind: "cron",
		expression,
		timezone,
	};
}

function parseScheduleDate(value: string, timeZone: string, message: string): Date {
	const trimmed = value.trim();
	if (hasExplicitTimeZoneOffset(trimmed)) {
		return parseValidDate(trimmed, message);
	}

	const localParts = parseLocalDateTimeParts(trimmed);
	if (!localParts) {
		return parseValidDate(trimmed, message);
	}

	const date = localDateTimeToUtc(localParts, timeZone);
	if (!date || !localDateTimePartsEqual(getTimeZoneDateTimeParts(date, timeZone), localParts)) {
		throw new Error(message);
	}
	return date;
}

function parseValidDate(value: string, message: string): Date {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new Error(message);
	}
	return date;
}

function normalizeAssetRefs(assetRefs: readonly string[] | undefined): string[] {
	return Array.from(new Set((assetRefs ?? []).map((value) => value.trim()).filter((value) => value.length > 0)));
}

function normalizeExecution(execution: ConnExecution | undefined): ConnExecution {
	if (!execution) {
		return DEFAULT_EXECUTION;
	}
	if (execution.type === "agent_prompt") {
		return DEFAULT_EXECUTION;
	}
	if (execution.type === "team_group") {
		return { type: "team_group", groupId: normalizeRequiredId(execution.groupId, "execution.groupId") };
	}
	throw new Error("Invalid conn execution: type is invalid");
}

function normalizeOptionalId(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function normalizeRequiredId(value: string, fieldName: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`Invalid conn ${fieldName}: value must be non-empty`);
	}
	return trimmed;
}

function normalizePublicSiteId(value: string): string {
	const siteId = normalizeRequiredId(value, "publicSiteId");
	if (siteId === "." || siteId === ".." || siteId.includes("..") || !/^[A-Za-z0-9._-]+$/.test(siteId)) {
		throw new Error("Invalid conn publicSiteId: value must be a URL-safe slug");
	}
	return siteId;
}

function normalizeMaxRunMs(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error("Invalid conn maxRunMs: value must be a positive number");
	}
	return Math.trunc(value);
}

function hasExplicitTimeZoneOffset(value: string): boolean {
	return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
}

interface LocalDateTimeParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	millisecond: number;
}

function parseLocalDateTimeParts(value: string): LocalDateTimeParts | undefined {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
	if (!match) {
		return undefined;
	}
	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4] ?? 0),
		minute: Number(match[5] ?? 0),
		second: Number(match[6] ?? 0),
		millisecond: Number((match[7] ?? "0").padEnd(3, "0")),
	};
}

function localDateTimeToUtc(parts: LocalDateTimeParts, timeZone: string): Date | undefined {
	const targetMs = partsToUtcMs(parts);
	let utcMs = targetMs;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const actualParts = getTimeZoneDateTimeParts(new Date(utcMs), timeZone);
		const diffMs = partsToUtcMs(actualParts) - targetMs;
		if (diffMs === 0) {
			return new Date(utcMs);
		}
		utcMs -= diffMs;
	}
	return new Date(utcMs);
}

function partsToUtcMs(parts: LocalDateTimeParts): number {
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
}

function getTimeZoneDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts {
	const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		hourCycle: "h23",
	});
	const values: Partial<LocalDateTimeParts> = {};
	for (const part of formatter.formatToParts(date)) {
		if (part.type === "year") {
			values.year = Number(part.value);
		} else if (part.type === "month") {
			values.month = Number(part.value);
		} else if (part.type === "day") {
			values.day = Number(part.value);
		} else if (part.type === "hour") {
			values.hour = Number(part.value);
		} else if (part.type === "minute") {
			values.minute = Number(part.value);
		} else if (part.type === "second") {
			values.second = Number(part.value);
		}
	}
	return {
		year: values.year ?? 0,
		month: values.month ?? 0,
		day: values.day ?? 0,
		hour: values.hour ?? 0,
		minute: values.minute ?? 0,
		second: values.second ?? 0,
		millisecond: date.getUTCMilliseconds(),
	};
}

function localDateTimePartsEqual(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
	return (
		left.year === right.year &&
		left.month === right.month &&
		left.day === right.day &&
		left.hour === right.hour &&
		left.minute === right.minute &&
		left.second === right.second &&
		left.millisecond === right.millisecond
	);
}
