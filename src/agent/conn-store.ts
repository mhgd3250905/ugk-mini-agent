export type ConnStatus = "active" | "paused" | "completed";
export type ConnUpgradePolicy = "latest" | "pinned" | "manual";
export type { ArtifactDeliveryConfig, ArtifactExpectedKind } from "./artifact-contract.js";
import type { ArtifactDeliveryConfig } from "./artifact-contract.js";

export type ConnExecution =
	| {
			type: "agent_prompt";
	  }
	| {
			type: "team_group";
			groupId: string;
	  };

export type ConnTarget =
	| {
			type: "task_inbox";
	  }
	| {
			type: "conversation";
			conversationId: string;
	  }
	| {
			type: "feishu_chat";
			chatId: string;
	  }
	| {
			type: "feishu_user";
			openId: string;
	  };

export type ConnSchedule =
	| {
			kind: "once";
			at: string;
			timezone?: string;
	  }
	| {
			kind: "interval";
			everyMs: number;
			startAt?: string;
			timezone?: string;
	  }
	| {
			kind: "cron";
			expression: string;
			timezone?: string;
	  };

export interface ConnDefinition {
	connId: string;
	title: string;
	prompt: string;
	target: ConnTarget;
	schedule: ConnSchedule;
	execution?: ConnExecution;
	assetRefs: string[];
	maxRunMs?: number;
	profileId?: string;
	browserId?: string;
	agentSpecId?: string;
	skillSetId?: string;
	modelPolicyId?: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy?: ConnUpgradePolicy;
	publicSiteId?: string;
	artifactDelivery?: ArtifactDeliveryConfig;
	status: ConnStatus;
	createdAt: string;
	updatedAt: string;
	lastRunAt?: string;
	nextRunAt?: string;
	lastRunId?: string;
}

export function computeNextRunAt(schedule: ConnSchedule, lastRunAt: Date | undefined, now: Date): Date | undefined {
	if (schedule.kind === "once") {
		const onceAt = new Date(schedule.at);
		return onceAt.getTime() > now.getTime() ? onceAt : undefined;
	}

	if (schedule.kind === "interval") {
		const baseTime = lastRunAt ?? (schedule.startAt ? new Date(schedule.startAt) : now);
		const next = new Date(baseTime.getTime() + schedule.everyMs);
		return next.getTime() > now.getTime() ? next : new Date(now.getTime() + schedule.everyMs);
	}

	return computeNextCronOccurrence(schedule.expression, now, schedule.timezone);
}

export function computeNextCronOccurrence(expression: string, now: Date, timeZone?: string): Date | undefined {
	const cron = parseCronExpression(expression);
	if (!cron) {
		return undefined;
	}
	const normalizedTimeZone = normalizeConnTimeZone(timeZone);
	if (!normalizedTimeZone) {
		return undefined;
	}

	const cursor = new Date(now);
	cursor.setSeconds(0, 0);
	cursor.setMinutes(cursor.getMinutes() + 1);

	for (let step = 0; step < 366 * 24 * 60; step += 1) {
		const parts = getCronDateParts(cursor, normalizedTimeZone);
		if (
			cron.minute.has(parts.minute) &&
			cron.hour.has(parts.hour) &&
			cron.dayOfMonth.has(parts.dayOfMonth) &&
			cron.month.has(parts.month) &&
			cron.dayOfWeek.has(parts.dayOfWeek)
		) {
			return new Date(cursor);
		}
		cursor.setMinutes(cursor.getMinutes() + 1);
	}

	return undefined;
}

function parseCronExpression(expression: string): {
	minute: Set<number>;
	hour: Set<number>;
	dayOfMonth: Set<number>;
	month: Set<number>;
	dayOfWeek: Set<number>;
} | null {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) {
		return null;
	}

	const minute = parseCronField(parts[0], 0, 59);
	const hour = parseCronField(parts[1], 0, 23);
	const dayOfMonth = parseCronField(parts[2], 1, 31);
	const month = parseCronField(parts[3], 1, 12);
	const dayOfWeek = parseCronField(parts[4], 0, 6);
	if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
		return null;
	}

	return {
		minute,
		hour,
		dayOfMonth,
		month,
		dayOfWeek,
	};
}

function parseCronField(field: string, min: number, max: number): Set<number> | null {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		if (part === "*") {
			for (let value = min; value <= max; value += 1) {
				values.add(value);
			}
			continue;
		}

		const stepMatch = part.match(/^\*\/(\d+)$/);
		if (stepMatch) {
			const step = Number(stepMatch[1]);
			if (!Number.isInteger(step) || step <= 0) {
				return null;
			}
			for (let value = min; value <= max; value += step) {
				values.add(value);
			}
			continue;
		}

		const rangeMatch = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
		if (rangeMatch) {
			const rangeStart = Number(rangeMatch[1]);
			const rangeEnd = Number(rangeMatch[2]);
			const step = rangeMatch[3] ? Number(rangeMatch[3]) : 1;
			if (
				!Number.isInteger(rangeStart) ||
				!Number.isInteger(rangeEnd) ||
				!Number.isInteger(step) ||
				rangeStart < min ||
				rangeEnd > max ||
				rangeStart > rangeEnd ||
				step <= 0
			) {
				return null;
			}
			for (let value = rangeStart; value <= rangeEnd; value += step) {
				values.add(value);
			}
			continue;
		}

		const value = Number(part);
		if (!Number.isInteger(value) || value < min || value > max) {
			return null;
		}
		values.add(value);
	}

	return values;
}

interface CronDateParts {
	minute: number;
	hour: number;
	dayOfMonth: number;
	month: number;
	dayOfWeek: number;
}

const weekdayIndexByLabel: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

const cronFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getCronDateParts(date: Date, timeZone: string): CronDateParts {
	const formatter = getCronFormatter(timeZone);
	const parts = formatter.formatToParts(date);
	const values: Partial<CronDateParts> = {};
	let weekdayLabel = "";

	for (const part of parts) {
		if (part.type === "weekday") {
			weekdayLabel = part.value;
			continue;
		}
		if (part.type === "month") {
			values.month = Number(part.value);
			continue;
		}
		if (part.type === "day") {
			values.dayOfMonth = Number(part.value);
			continue;
		}
		if (part.type === "hour") {
			const hour = Number(part.value);
			values.hour = hour === 24 ? 0 : hour;
			continue;
		}
		if (part.type === "minute") {
			values.minute = Number(part.value);
		}
	}

	return {
		minute: values.minute ?? date.getMinutes(),
		hour: values.hour ?? date.getHours(),
		dayOfMonth: values.dayOfMonth ?? date.getDate(),
		month: values.month ?? date.getMonth() + 1,
		dayOfWeek: weekdayIndexByLabel[weekdayLabel] ?? date.getDay(),
	};
}

function getCronFormatter(timeZone: string): Intl.DateTimeFormat {
	const cached = cronFormatterCache.get(timeZone);
	if (cached) {
		return cached;
	}

	const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
		timeZone,
		weekday: "short",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		hour12: false,
		hourCycle: "h23",
	});
	cronFormatterCache.set(timeZone, formatter);
	return formatter;
}

export function normalizeConnTimeZone(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	const timeZone = trimmed || process.env.CONN_DEFAULT_TIMEZONE?.trim() || "Asia/Shanghai";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
		return timeZone;
	} catch {
		return undefined;
	}
}
