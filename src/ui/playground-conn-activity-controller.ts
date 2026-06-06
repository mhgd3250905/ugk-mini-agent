export function getConnActivityConstantsScript(): string {
	return `
		const CONN_STATUS_LABELS = {
			active: "运行中",
			paused: "已暂停",
			completed: "已完成",
		};
		const CONN_RUN_STATUS_LABELS = {
			pending: "待执行",
			running: "执行中",
			succeeded: "成功",
			failed: "失败",
			cancelled: "已取消",
		};
		const ACTIVITY_SOURCE_LABELS = {
			conn: "后台任务",
			feishu: "飞书",
			notification: "通知",
			agent: "助手",
		};
		const CONN_RUN_REFRESH_DELAY_MS = 3000;
		const CONN_RUN_REFRESH_MAX_ATTEMPTS = 120;

	`;
}

export function getConnActivityElementRefsScript(): string {
	return `
		const connRunDetailsDialog = document.getElementById("conn-run-details-dialog");
		const connRunDetailsBody = document.getElementById("conn-run-details-body");
		const connRunDetailsClose = document.getElementById("conn-run-details-close");
		const openTaskInboxButton = document.getElementById("open-task-inbox-button");
		const taskInboxUnreadBadge = document.getElementById("task-inbox-unread-badge");
		const taskInboxView = document.getElementById("task-inbox-view");
		const taskInboxList = document.getElementById("task-inbox-list");
		const closeTaskInboxButton = document.getElementById("close-task-inbox-button");
		const refreshTaskInboxButton = document.getElementById("refresh-task-inbox-button");
		const openConnManagerButton = document.getElementById("open-conn-manager-button");
		const connManagerUnreadBadge = document.getElementById("conn-manager-unread-badge");
		const connManagerDialog = document.getElementById("conn-manager-dialog");
		const connManagerNotice = document.getElementById("conn-manager-notice");
		const connManagerFilter = document.getElementById("conn-manager-filter");
		const connManagerSelectedCount = document.getElementById("conn-manager-selected-count");
		const selectVisibleConnsButton = document.getElementById("select-visible-conns-button");
		const clearSelectedConnsButton = document.getElementById("clear-selected-conns-button");
		const deleteSelectedConnsButton = document.getElementById("delete-selected-conns-button");
		const connManagerList = document.getElementById("conn-manager-list");
		const closeConnManagerButton = document.getElementById("close-conn-manager-button");
		const refreshConnManagerButton = document.getElementById("refresh-conn-manager-button");
		const openConnEditorButton = document.getElementById("open-conn-editor-button");
		const connEditorDialog = document.getElementById("conn-editor-dialog");
		const connEditorForm = document.getElementById("conn-editor-form");
		const connEditorTitle = document.getElementById("conn-editor-title");
		const connEditorError = document.getElementById("conn-editor-error");
		const connEditorTitleInput = document.getElementById("conn-editor-title-input");
		const connEditorExecutionType = document.getElementById("conn-editor-execution-type");
		const connEditorTeamGroupRow = document.getElementById("conn-editor-team-group-row");
		const connEditorTeamGroupId = document.getElementById("conn-editor-team-group-id");
		const connEditorTeamGroupHint = document.getElementById("conn-editor-team-group-hint");
		const connEditorTeamGroupPreview = document.getElementById("conn-editor-team-group-preview");
		const connEditorPrompt = document.getElementById("conn-editor-prompt");
		const connEditorTargetType = document.getElementById("conn-editor-target-type");
		const connEditorTargetId = document.getElementById("conn-editor-target-id");
		const connEditorTargetIdLabel = document.getElementById("conn-editor-target-id-label");
		const connEditorTargetIdHint = document.getElementById("conn-editor-target-id-hint");
		const connEditorTargetCurrent = document.getElementById("conn-editor-target-current");
		const connEditorTargetPreview = document.getElementById("conn-editor-target-preview");
		const connEditorScheduleKind = document.getElementById("conn-editor-schedule-kind");
		const connEditorOnceAt = document.getElementById("conn-editor-once-at");
		const connEditorIntervalMinutes = document.getElementById("conn-editor-interval-minutes");
		const connEditorIntervalStart = document.getElementById("conn-editor-interval-start");
		const connEditorTimeOfDay = document.getElementById("conn-editor-time-of-day");
		const connEditorProfileId = document.getElementById("conn-editor-profile-id");
		const connEditorBrowserId = document.getElementById("conn-editor-browser-id");
		const connEditorAgentSpecId = document.getElementById("conn-editor-agent-spec-id");
		const connEditorSkillSetId = document.getElementById("conn-editor-skill-set-id");
		const connEditorModelProvider = document.getElementById("conn-editor-model-provider");
		const connEditorModelId = document.getElementById("conn-editor-model-id");
		const connEditorModelAuth = document.getElementById("conn-editor-model-auth");
		const connEditorUpgradePolicy = document.getElementById("conn-editor-upgrade-policy");
		const connEditorMaxRunSeconds = document.getElementById("conn-editor-max-run-seconds");
		const connEditorPickAssetsButton = document.getElementById("conn-editor-pick-assets-button");
		const connEditorUploadAssetsButton = document.getElementById("conn-editor-upload-assets-button");
		const connEditorAssetFileInput = document.getElementById("conn-editor-asset-file-input");
		const connEditorSelectedAssets = document.getElementById("conn-editor-selected-assets");
		const connEditorAssetRefs = document.getElementById("conn-editor-asset-refs");
		const saveConnEditorButton = document.getElementById("save-conn-editor-button");
		const cancelConnEditorButton = document.getElementById("cancel-conn-editor-button");
		const closeConnEditorButton = document.getElementById("close-conn-editor-button");
	`;
}

export function getConnActivityEditorScript(): string {
	return `
		function closeConnRunDetailsDialog() {
			releasePanelFocusBeforeHide(connRunDetailsDialog, state.connRunDetailsRestoreFocusElement);
			state.connRunDetailsRestoreFocusElement = null;
			state.connRunDetailsPagination = null;
			connRunDetailsDialog.classList.remove("open");
			connRunDetailsDialog.hidden = true;
			connRunDetailsDialog.setAttribute("aria-hidden", "true");
			connRunDetailsBody.innerHTML = "";
		}

		function openConnManager(restoreFocusElement, options) {
			state.connManagerOpen = true;
			state.connManagerRestoreFocusElement = rememberPanelReturnFocus(
				restoreFocusElement || openConnManagerButton,
			);
			connManagerDialog.hidden = false;
			connManagerDialog.classList.add("open");
			connManagerDialog.setAttribute("aria-hidden", "false");
			renderConnManager();
			openWorkspacePanel("conn", connManagerDialog, {
				forceOverlay: options?.mode !== "workspace",
			});
			void loadConnBrowserCatalog().then(() => renderConnManager());
			void fetchTeamTaskGroups().then(() => renderConnManager());
			void loadConnManager({ silent: false });
		}

		function closeConnManager() {
			state.connManagerOpen = false;
			restoreFocusAfterPanelClose(connManagerDialog, state.connManagerRestoreFocusElement);
			connManagerDialog.classList.remove("open");
			connManagerDialog.hidden = true;
			connManagerDialog.setAttribute("aria-hidden", "true");
			closeWorkspacePanel("conn", connManagerDialog);
		}

		function openConnEditor(mode, conn, restoreFocusElement) {
			const editing = mode === "edit" && conn?.connId;
			state.connEditorOpen = true;
			state.connEditorRestoreFocusElement = rememberPanelReturnFocus(
				restoreFocusElement || openConnEditorButton,
			);
			state.connEditorMode = editing ? "edit" : "create";
			state.connEditorConnId = editing ? conn.connId : "";
			state.connEditorSaving = false;
			state.connEditorError = "";
			fillConnEditor(buildConnEditorDraft(editing ? conn : null));
			renderConnEditor();
			void loadAgentCatalog().then(() => renderConnEditorAgentOptions());
			void loadConnBrowserCatalog().then(() => renderConnEditorBrowserOptions());
			void fetchTeamTaskGroups().then(() => renderConnEditorTeamGroupOptions());
			void ensureConnEditorModelConfig();
			void loadAssets(true);
			connEditorDialog.hidden = false;
			connEditorDialog.classList.add("open");
			connEditorDialog.setAttribute("aria-hidden", "false");
			connEditorTitleInput.focus();
		}

		function closeConnEditor() {
			state.connEditorOpen = false;
			state.connEditorSaving = false;
			state.connEditorError = "";
			if (connEditorAssetFileInput) {
				connEditorAssetFileInput.value = "";
			}
			restoreFocusAfterPanelClose(connEditorDialog, state.connEditorRestoreFocusElement);
			state.connEditorRestoreFocusElement = null;
			connEditorDialog.classList.remove("open");
			connEditorDialog.hidden = true;
			connEditorDialog.setAttribute("aria-hidden", "true");
		}

		function padDatePart(value) {
			return String(value).padStart(2, "0");
		}

		function formatConnDateTimeLocal(value) {
			const date = value ? new Date(value) : new Date(Date.now() + 5 * 60 * 1000);
			if (Number.isNaN(date.getTime())) {
				return "";
			}
			return [
				date.getFullYear(),
				"-",
				padDatePart(date.getMonth() + 1),
				"-",
				padDatePart(date.getDate()),
				"T",
				padDatePart(date.getHours()),
				":",
				padDatePart(date.getMinutes()),
			].join("");
		}

		function parseConnDateTimeLocal(value) {
			const text = String(value || "").trim();
			if (!text) {
				return "";
			}
			const date = new Date(text);
			if (Number.isNaN(date.getTime())) {
				return "";
			}
			return date.toISOString();
		}

		function normalizeConnAssetRefsText(value) {
			return String(value || "")
				.split(/\\\\r?\\\\n|,/)
				.map((entry) => entry.trim())
				.filter(Boolean);
		}

		function getLocalTimezone() {
			try {
				return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			} catch {
				return "UTC";
			}
		}

		function normalizeConnExecution(conn) {
			const execution = conn?.execution && typeof conn.execution === "object" ? conn.execution : null;
			if (execution?.type === "team_group") {
				return { type: "team_group", groupId: String(execution.groupId || "").trim() };
			}
			return { type: "agent_prompt" };
		}

		function getConnEditorExecutionType() {
			return String(connEditorExecutionType?.value || "agent_prompt").trim() === "team_group"
				? "team_group"
				: "agent_prompt";
		}

		function getConnEditorTeamTaskGroups() {
			return Array.isArray(state.connEditorTeamTaskGroups) ? state.connEditorTeamTaskGroups : [];
		}

		function getTeamTaskGroupLabel(group) {
			const groupId = String(group?.groupId || "").trim();
			const title = String(group?.title || "").trim();
			return title ? title + " · " + groupId : groupId;
		}

		function getTeamTaskGroupValidationMessage(group) {
			if (group?.archived) {
				return "Group 已归档，不能用于 Conn 调度";
			}
			if (group?.status !== "valid") {
				const errors = Array.isArray(group?.validation?.errors) ? group.validation.errors : [];
				const messages = errors
					.map((entry) => String(entry?.message || entry?.code || "").trim())
					.filter(Boolean);
				return messages.length > 0 ? messages.join("；") : "Group 当前不是 valid 状态";
			}
			return "";
		}

		function isUsableTeamTaskGroup(group) {
			return Boolean(group?.groupId && !group.archived && group.status === "valid");
		}

		function findConnEditorTeamTaskGroup(groupId) {
			const normalized = String(groupId || "").trim();
			return getConnEditorTeamTaskGroups().find((group) => String(group?.groupId || "").trim() === normalized) || null;
		}

		function describeConnExecution(conn) {
			const execution = normalizeConnExecution(conn);
			if (execution.type === "team_group") {
				const group = findConnEditorTeamTaskGroup(execution.groupId);
				return "Team Group · " + (group ? getTeamTaskGroupLabel(group) : execution.groupId);
			}
			return "提示词任务";
		}

		function buildConnEditorDraft(conn) {
			const target = conn?.target || {};
			const schedule = conn?.schedule || {};
			const execution = normalizeConnExecution(conn);
			const targetType =
				target.type === "feishu_chat" || target.type === "feishu_user" ? target.type : "task_inbox";
			const targetId =
				targetType === "feishu_chat"
					? target.chatId || ""
					: targetType === "feishu_user"
						? target.openId || ""
						: "";
			return {
				title: conn?.title || "",
				prompt: conn?.prompt || "",
				executionType: execution.type,
				teamGroupId: execution.type === "team_group" ? execution.groupId : "",
				targetType,
				targetId,
				scheduleKind: inferConnScheduleMode(schedule),
				onceAt: formatConnDateTimeLocal(schedule.kind === "once" ? schedule.at : undefined),
				intervalMinutes:
					schedule.kind === "interval" && Number.isFinite(Number(schedule.everyMs))
						? String(Math.max(1, Math.round(Number(schedule.everyMs) / 60000)))
						: "60",
				intervalStart: formatConnDateTimeLocal(schedule.kind === "interval" ? schedule.startAt : undefined),
				timeOfDay: inferConnScheduleTimeOfDay(schedule),
				profileId: conn?.profileId || "main",
				browserId: conn?.browserId || "",
				agentSpecId: conn?.agentSpecId || "",
				skillSetId: conn?.skillSetId || "",
				modelProvider: conn?.modelProvider || "",
				modelId: conn?.modelId || "",
				upgradePolicy: conn?.upgradePolicy || "latest",
				maxRunSeconds: conn?.maxRunMs ? String(Math.round(Number(conn.maxRunMs) / 1000)) : "",
				assetRefs: Array.isArray(conn?.assetRefs) ? conn.assetRefs.join("\\n") : "",
			};
		}

		function fillConnEditor(draft) {
			connEditorTitleInput.value = draft.title;
			connEditorExecutionType.value = draft.executionType;
			connEditorTeamGroupId.dataset.pendingValue = draft.teamGroupId;
			connEditorPrompt.value = draft.prompt;
			connEditorTargetType.value = draft.targetType;
			connEditorTargetId.value = draft.targetId;
			connEditorScheduleKind.value = draft.scheduleKind;
			connEditorOnceAt.value = draft.onceAt;
			connEditorIntervalMinutes.value = draft.intervalMinutes;
			connEditorIntervalStart.value = draft.intervalStart;
			connEditorTimeOfDay.value = draft.timeOfDay;
			connEditorProfileId.value = draft.profileId;
			connEditorProfileId.dataset.pendingValue = draft.profileId;
			renderConnEditorAgentOptions();
			connEditorBrowserId.value = draft.browserId;
			connEditorBrowserId.dataset.pendingValue = draft.browserId;
			renderConnEditorBrowserOptions();
			connEditorAgentSpecId.value = draft.agentSpecId;
			connEditorSkillSetId.value = draft.skillSetId;
			connEditorModelProvider.dataset.pendingValue = draft.modelProvider;
			connEditorModelId.dataset.pendingValue = draft.modelId;
			renderConnEditorModelOptions();
			connEditorUpgradePolicy.value = draft.upgradePolicy;
			connEditorMaxRunSeconds.value = draft.maxRunSeconds;
			state.connEditorSelectedAssetRefs = normalizeConnAssetRefsText(draft.assetRefs);
			connEditorAssetRefs.value = state.connEditorSelectedAssetRefs.join("\\\\n");
			renderConnEditorSelectedAssets();
			renderConnEditorTeamGroupOptions();
			syncConnEditorTimePickers();
		}

		function parseConnCronExpression(expression) {
			const parts = String(expression || "")
				.trim()
				.split(/\\\\s+/)
				.filter(Boolean);
			if (parts.length !== 5) {
				return null;
			}
			const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
			if (!/^\\\\d+$/.test(minute) || !/^\\\\d+$/.test(hour)) {
				return null;
			}
			return {
				minute: Number(minute),
				hour: Number(hour),
				dayOfMonth,
				month,
				dayOfWeek,
			};
		}

		function formatConnTimeOfDay(hours, minutes) {
			if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
				return "";
			}
			return padDatePart(hours) + ":" + padDatePart(minutes);
		}

		function parseConnTimeOfDay(value) {
			const match = String(value || "")
				.trim()
				.match(/^(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?$/);
			if (!match) {
				return null;
			}
			const hours = Number(match[1]);
			const minutes = Number(match[2]);
			const seconds = match[3] === undefined ? 0 : Number(match[3]);
			if (
				!Number.isFinite(hours) ||
				!Number.isFinite(minutes) ||
				!Number.isFinite(seconds) ||
				hours < 0 ||
				hours > 23 ||
				minutes < 0 ||
				minutes > 59 ||
				seconds < 0 ||
				seconds > 59
			) {
				return null;
			}
			return { hours, minutes };
		}

		function decorateConnTimePicker(instance) {
			const calendar = instance?.calendarContainer;
			if (!calendar) {
				return;
			}
			calendar.classList.add("conn-time-picker-calendar");
			const input = instance.input;
			if (input?.dataset?.connTimePicker === "time") {
				calendar.classList.add("conn-time-picker-calendar-time-only");
			}
		}

		function syncConnTimePickerInput(input) {
			if (!input?._flatpickr) {
				return;
			}
			const value = String(input.value || "").trim();
			if (!value) {
				input._flatpickr.clear(false);
				return;
			}
			input._flatpickr.setDate(value, false, input._flatpickr.config.dateFormat);
		}

		function syncConnEditorTimePickers() {
			for (const input of [connEditorOnceAt, connEditorIntervalStart, connEditorTimeOfDay]) {
				syncConnTimePickerInput(input);
			}
		}

		function initializeConnEditorTimePickers() {
			if (typeof window.flatpickr !== "function") {
				for (const input of [connEditorOnceAt, connEditorIntervalStart, connEditorTimeOfDay]) {
					if (input) {
						input.removeAttribute("readonly");
					}
				}
				return;
			}
			const locale = window.flatpickr.l10ns?.zh || window.flatpickr.l10ns?.default || undefined;
			for (const input of [connEditorOnceAt, connEditorIntervalStart, connEditorTimeOfDay]) {
				if (!input || input._flatpickr) {
					continue;
				}
				const timeOnly = input.dataset.connTimePicker === "time";
				input.classList.add("conn-editor-time-input");
				input.setAttribute("readonly", "readonly");
				window.flatpickr(input, {
					allowInput: false,
					altInput: true,
					altFormat: timeOnly ? "H:i" : "m月d日 H:i",
					appendTo: document.body,
					dateFormat: timeOnly ? "H:i" : "Y-m-d\\\\TH:i",
					defaultHour: timeOnly ? 9 : 8,
					defaultMinute: 0,
					disableMobile: true,
					enableTime: true,
					locale,
					minDate: timeOnly ? undefined : "today",
					minuteIncrement: 5,
					noCalendar: timeOnly,
					time_24hr: true,
					onReady: (_selectedDates, _dateStr, instance) => {
						decorateConnTimePicker(instance);
					},
					onOpen: (_selectedDates, _dateStr, instance) => {
						decorateConnTimePicker(instance);
					},
				});
			}
			syncConnEditorTimePickers();
		}

		function inferConnScheduleMode(schedule) {
			if (!schedule || typeof schedule !== "object") {
				return "once";
			}
			if (schedule.kind === "interval") {
				return "interval";
			}
			if (schedule.kind === "once" || !schedule.kind) {
				return "once";
			}
			return "daily";
		}

		function inferConnScheduleTimeOfDay(schedule) {
			if (!schedule || schedule.kind !== "cron") {
				return "09:00";
			}
			const parsed = parseConnCronExpression(schedule.expression);
			if (!parsed) {
				return "09:00";
			}
			return formatConnTimeOfDay(parsed.hour, parsed.minute) || "09:00";
		}

		function buildConnDailyCronExpression() {
			const timeOfDay = parseConnTimeOfDay(connEditorTimeOfDay.value);
			if (!timeOfDay) {
				return "";
			}
			return String(timeOfDay.minutes) + " " + String(timeOfDay.hours) + " * * *";
		}

		function describeConnTargetInput(targetType) {
			if (targetType === "feishu_chat") {
				return {
					label: "飞书群",
					placeholder: "oc_xxx / chat id",
					hint: "填写接收结果的飞书群 chat id。",
				};
			}
			if (targetType === "feishu_user") {
				return {
					label: "飞书用户",
					placeholder: "ou_xxx / open id",
					hint: "填写接收结果的飞书用户 open id。",
				};
			}
			return {
				label: "投递目标",
				placeholder: "task inbox",
				hint: "后台任务结果默认进入任务消息页。",
			};
		}

		function setConnEditorSectionVisibility() {
			const executionType = getConnEditorExecutionType();
			const promptField = connEditorPrompt.closest(".conn-editor-field");
			const modelGrid = connEditorForm.querySelector(".conn-editor-model-grid");
			const advanced = connEditorForm.querySelector(".conn-editor-advanced");
			const isTeamGroup = executionType === "team_group";
			if (promptField) {
				promptField.classList.toggle("is-hidden", isTeamGroup);
			}
			if (modelGrid) {
				modelGrid.classList.toggle("is-hidden", isTeamGroup);
			}
			if (advanced) {
				advanced.classList.toggle("is-hidden", isTeamGroup);
			}
			connEditorPrompt.required = !isTeamGroup;
			connEditorTeamGroupRow.hidden = !isTeamGroup;
			connEditorTeamGroupPreview.hidden = !isTeamGroup;
			if (isTeamGroup) {
				renderConnEditorTeamGroupOptions();
			}

			const targetType = connEditorTargetType.value;
			connEditorTargetCurrent.hidden = targetType !== "task_inbox";
			connEditorTargetId.parentElement.hidden = targetType === "task_inbox";
			const targetInput = describeConnTargetInput(targetType);
			connEditorTargetIdLabel.textContent = targetInput.label;
			connEditorTargetId.placeholder = targetInput.placeholder;
			connEditorTargetIdHint.textContent = targetInput.hint;
			renderConnEditorTargetPreview();

			const scheduleKind = String(connEditorScheduleKind.value || "once").trim();
			for (const panel of connEditorForm.querySelectorAll("[data-schedule-panel]")) {
				panel.classList.toggle(
					"is-hidden",
					String(panel.dataset.schedulePanel || "").trim() !== scheduleKind,
				);
			}
		}

		function renderConnEditorTeamGroupOptions() {
			if (!connEditorTeamGroupId) {
				return;
			}
			const pendingValue = String(connEditorTeamGroupId.dataset.pendingValue || connEditorTeamGroupId.value || "").trim();
			const groups = getConnEditorTeamTaskGroups();
			connEditorTeamGroupId.innerHTML = "";

			if (state.connEditorTeamTaskGroupsLoading) {
				const option = document.createElement("option");
				option.value = "";
				option.textContent = "正在读取 Team Group...";
				option.disabled = true;
				connEditorTeamGroupId.appendChild(option);
				connEditorTeamGroupId.disabled = true;
				connEditorTeamGroupHint.textContent = "正在从 /v1/team/task-groups 读取后端 Group。";
				connEditorTeamGroupPreview.textContent = "正在读取 Team Group...";
				return;
			}

			if (state.connEditorTeamTaskGroupsError) {
				const option = document.createElement("option");
				option.value = "";
				option.textContent = "Team Group 读取失败";
				option.disabled = true;
				connEditorTeamGroupId.appendChild(option);
				connEditorTeamGroupId.disabled = false;
				connEditorTeamGroupHint.textContent = state.connEditorTeamTaskGroupsError;
				connEditorTeamGroupPreview.textContent = state.connEditorTeamTaskGroupsError;
				return;
			}

			const placeholder = document.createElement("option");
			placeholder.value = "";
			placeholder.textContent = groups.length > 0 ? "选择 Team Group" : "暂无可用 Team Group";
			placeholder.disabled = true;
			connEditorTeamGroupId.appendChild(placeholder);

			for (const group of groups) {
				const groupId = String(group?.groupId || "").trim();
				if (!groupId) {
					continue;
				}
				const option = document.createElement("option");
				option.value = groupId;
				option.textContent = getTeamTaskGroupLabel(group);
				const validationMessage = getTeamTaskGroupValidationMessage(group);
				if (validationMessage) {
					option.textContent += "（不可运行）";
					option.disabled = true;
					option.title = validationMessage;
				}
				connEditorTeamGroupId.appendChild(option);
			}
			if (pendingValue && !groups.some((group) => String(group?.groupId || "").trim() === pendingValue)) {
				const option = document.createElement("option");
				option.value = pendingValue;
				option.textContent = pendingValue + "（未找到）";
				option.disabled = true;
				connEditorTeamGroupId.appendChild(option);
			}

			connEditorTeamGroupId.value = pendingValue && Array.from(connEditorTeamGroupId.options).some((option) => option.value === pendingValue)
				? pendingValue
				: "";
			connEditorTeamGroupId.disabled = state.connEditorSaving || groups.length === 0;
			delete connEditorTeamGroupId.dataset.pendingValue;
			renderConnEditorTeamGroupPreview();
		}

		function renderConnEditorTeamGroupPreview() {
			const groupId = String(connEditorTeamGroupId?.value || "").trim();
			const group = findConnEditorTeamTaskGroup(groupId);
			const selectedProblem = groupId ? (group ? getTeamTaskGroupValidationMessage(group) : "Team Group 不存在或已归档") : "";
			if (!state.connEditorTeamTaskGroupsLoaded && !state.connEditorTeamTaskGroupsError) {
				connEditorTeamGroupHint.textContent = "正在读取后端 Team Group。";
			} else if (!groupId) {
				connEditorTeamGroupHint.textContent = "请先选择可运行的 Team Group。";
			} else if (selectedProblem) {
				connEditorTeamGroupHint.textContent = selectedProblem;
			} else {
				connEditorTeamGroupHint.textContent = "保存后 Conn 会调度整个 Team Group，结果仍按下方投递目标发送。";
			}
			connEditorTeamGroupPreview.innerHTML = "";
			const label = document.createElement("strong");
			label.textContent = group ? getTeamTaskGroupLabel(group) : "Team Group";
			const detail = document.createElement("span");
			detail.textContent = group
				? "状态：" + String(group.status || "unknown") + " / Head Tasks：" + (Array.isArray(group.headTaskIds) ? group.headTaskIds.length : 0)
				: "请选择后端已有 Group，不能填写单个 Task。";
			const id = document.createElement("code");
			id.textContent = groupId || "未选择";
			connEditorTeamGroupPreview.appendChild(label);
			connEditorTeamGroupPreview.appendChild(detail);
			connEditorTeamGroupPreview.appendChild(id);
			if (selectedProblem) {
				const problem = document.createElement("span");
				problem.className = "conn-editor-target-note";
				problem.textContent = selectedProblem;
				connEditorTeamGroupPreview.appendChild(problem);
			}
		}

		function isConnEditorTeamGroupSelectionReady() {
			if (getConnEditorExecutionType() !== "team_group") {
				return true;
			}
			const groupId = String(connEditorTeamGroupId?.value || "").trim();
			const group = findConnEditorTeamTaskGroup(groupId);
			return Boolean(group && isUsableTeamTaskGroup(group));
		}

		function renderConnEditorTargetPreview() {
			const targetType = String(connEditorTargetType.value || "task_inbox").trim();
			const targetId = String(connEditorTargetId.value || "").trim();
			connEditorTargetPreview.innerHTML = "";

			const label = document.createElement("strong");
			const detail = document.createElement("span");
			const id = document.createElement("code");
			if (targetType === "feishu_chat") {
				label.textContent = "飞书群";
				detail.textContent = "结果会投递到指定飞书群。";
				id.textContent = targetId || "填写 chat id";
			} else if (targetType === "feishu_user") {
				label.textContent = "飞书用户";
				detail.textContent = "结果会投递到指定飞书用户。";
				id.textContent = targetId || "填写 open id";
			} else {
				label.textContent = "任务消息";
				detail.textContent = "后台任务结果会投递到任务消息页";
				id.textContent = "task_inbox";
			}

			connEditorTargetPreview.appendChild(label);
			connEditorTargetPreview.appendChild(detail);
			connEditorTargetPreview.appendChild(id);
		}

		function renderConnEditorError(message) {
			state.connEditorError = String(message || "").trim();
			connEditorError.textContent = state.connEditorError;
			connEditorError.hidden = !state.connEditorError;
		}

		function getKnownAgentCatalog() {
			return Array.isArray(state.agentCatalog) && state.agentCatalog.length > 0
				? state.agentCatalog
				: [
					{ agentId: "main", name: "主 Agent" },
					{ agentId: "search", name: "搜索 Agent" },
				];
		}

		function getAgentDisplayName(agentId) {
			const normalized = String(agentId || "").trim() || "main";
			const agent = getKnownAgentCatalog().find((entry) => String(entry?.agentId || "").trim() === normalized);
			return String(agent?.name || (normalized === "main" ? "主 Agent" : normalized));
		}

		function renderConnEditorAgentOptions() {
			if (!connEditorProfileId) {
				return;
			}
			const pendingValue = String(connEditorProfileId.dataset.pendingValue || connEditorProfileId.value || "main").trim() || "main";
			const agents = getKnownAgentCatalog();
			connEditorProfileId.innerHTML = "";
			for (const agent of agents) {
				const agentId = String(agent?.agentId || "").trim();
				if (!agentId) {
					continue;
				}
				const option = document.createElement("option");
				option.value = agentId;
				option.textContent = String(agent?.name || agentId);
				connEditorProfileId.appendChild(option);
			}
			if (!agents.some((agent) => String(agent?.agentId || "").trim() === pendingValue)) {
				const option = document.createElement("option");
				option.value = pendingValue;
				option.textContent = pendingValue + "（不可用，执行时会降级）";
				connEditorProfileId.appendChild(option);
			}
			connEditorProfileId.value = pendingValue;
			connEditorProfileId.disabled = state.connEditorSaving;
			delete connEditorProfileId.dataset.pendingValue;
		}

		function getConnBrowserCatalog() {
			return Array.isArray(state.browserCatalog) && state.browserCatalog.length > 0
				? state.browserCatalog
				: [{ browserId: "default", name: "Default", isDefault: true }];
		}

		function getConnBrowserLabel(browserId) {
			const normalized = String(browserId || "").trim();
			if (!normalized) {
				return "跟随执行 Agent";
			}
			const browser = getConnBrowserCatalog().find((entry) => String(entry?.browserId || "").trim() === normalized);
			return browser ? (browser.name || browser.browserId) + " · " + browser.browserId : normalized;
		}

		async function loadConnBrowserCatalog() {
			try {
				const response = await fetch("/v1/browsers", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取浏览器列表");
				}
				state.defaultBrowserId = String(payload?.defaultBrowserId || "default").trim() || "default";
				state.browserCatalog = Array.isArray(payload?.browsers) ? payload.browsers : [];
				state.browserCatalogReliable = true;
			} catch {
				state.defaultBrowserId = "default";
				state.browserCatalog = [{ browserId: "default", name: "Default", isDefault: true }];
				state.browserCatalogReliable = false;
			}
		}

		function renderConnEditorBrowserOptions() {
			if (!connEditorBrowserId) {
				return;
			}
			const pendingValue = String(connEditorBrowserId.dataset.pendingValue || connEditorBrowserId.value || "").trim();
			connEditorBrowserId.innerHTML = "";
			const followOption = document.createElement("option");
			followOption.value = "";
			followOption.textContent = "跟随执行 Agent";
			connEditorBrowserId.appendChild(followOption);
			for (const browser of getConnBrowserCatalog()) {
				const browserId = String(browser?.browserId || "").trim();
				if (!browserId) {
					continue;
				}
				const option = document.createElement("option");
				option.value = browserId;
				option.textContent = getConnBrowserLabel(browserId);
				connEditorBrowserId.appendChild(option);
			}
			if (pendingValue && !getConnBrowserCatalog().some((browser) => String(browser?.browserId || "").trim() === pendingValue)) {
				const option = document.createElement("option");
				option.value = pendingValue;
				option.textContent = pendingValue + "（未在当前浏览器列表中）";
				connEditorBrowserId.appendChild(option);
			}
			connEditorBrowserId.value = pendingValue;
			connEditorBrowserId.disabled = state.connEditorSaving;
			delete connEditorBrowserId.dataset.pendingValue;
		}

		async function ensureConnEditorModelConfig() {
			if (!state.modelConfig) {
				await loadModelConfig();
			}
			renderConnEditorModelOptions();
		}

		function findConnEditorProvider(providerId) {
			return state.modelConfig?.providers?.find((provider) => provider.id === providerId) || null;
		}

		function renderConnEditorModelOptions() {
			if (!connEditorModelProvider || !connEditorModelId) {
				return;
			}
			const providers = state.modelConfig?.providers || [];
			const pendingProvider = connEditorModelProvider.dataset.pendingValue || connEditorModelProvider.value || state.modelConfig?.current?.provider || "";
			const pendingModel = connEditorModelId.dataset.pendingValue || connEditorModelId.value || state.modelConfig?.current?.model || "";
			connEditorModelProvider.innerHTML = "";
			if (providers.length === 0) {
				const option = document.createElement("option");
				option.value = "";
				option.textContent = state.modelConfigLoading ? "模型源读取中" : "暂无可用模型源";
				connEditorModelProvider.appendChild(option);
				connEditorModelProvider.disabled = true;
				connEditorModelId.disabled = true;
				connEditorModelId.innerHTML = "";
				connEditorModelAuth.textContent = state.modelConfigLoading ? "正在读取可用 API 源" : "模型源不可用";
				connEditorModelAuth.dataset.state = "missing";
				return;
			}
			connEditorModelProvider.disabled = state.connEditorSaving || state.modelConfigLoading;
			for (const provider of providers) {
				const option = document.createElement("option");
				option.value = provider.id;
				option.textContent = getModelConfigProviderLabel(provider);
				connEditorModelProvider.appendChild(option);
			}
			if (providers.some((provider) => provider.id === pendingProvider)) {
				connEditorModelProvider.value = pendingProvider;
			}
			if (!connEditorModelProvider.value) {
				connEditorModelProvider.value = providers[0].id;
			}

			const provider = findConnEditorProvider(connEditorModelProvider.value);
			const models = provider?.models || [];
			connEditorModelId.innerHTML = "";
			for (const model of models) {
				const option = document.createElement("option");
				option.value = model.id;
				option.textContent = getModelConfigOptionLabel(model);
				connEditorModelId.appendChild(option);
			}
			if (models.some((model) => model.id === pendingModel)) {
				connEditorModelId.value = pendingModel;
			}
			if (!connEditorModelId.value && models[0]) {
				connEditorModelId.value = models[0].id;
			}
			connEditorModelId.disabled = state.connEditorSaving || state.modelConfigLoading || models.length === 0;
			const auth = provider?.auth || {};
			const envText = auth.envVar ? " · " + auth.envVar : "";
			connEditorModelAuth.textContent = provider
				? (auth.configured ? "密钥已配置" : "密钥未配置") + envText
				: "未选择 API 源";
			connEditorModelAuth.dataset.state = provider && auth.configured ? "ready" : "missing";
			delete connEditorModelProvider.dataset.pendingValue;
			delete connEditorModelId.dataset.pendingValue;
		}

		function renderConnEditorSelectedAssets() {
			if (!connEditorSelectedAssets) {
				return;
			}
			connEditorSelectedAssets.innerHTML = "";
			const selectedAssets = state.connEditorSelectedAssetRefs
				.map((assetId) => state.recentAssets.find((asset) => asset.assetId === assetId))
				.filter(Boolean);
			connEditorSelectedAssets.classList.toggle("visible", selectedAssets.length > 0);
			for (const asset of selectedAssets) {
				connEditorSelectedAssets.appendChild(
					createFileChip({
						tone: "asset",
						fileName: asset.fileName,
						meta:
							(asset.kind || "metadata") +
							" / " +
							(asset.mimeType || "application/octet-stream") +
							" / " +
							formatFileSize(asset.sizeBytes),
						onRemove: () => {
							state.connEditorSelectedAssetRefs = state.connEditorSelectedAssetRefs.filter(
								(currentId) => currentId !== asset.assetId,
							);
							connEditorAssetRefs.value = state.connEditorSelectedAssetRefs.join("\\\\n");
							renderConnEditorSelectedAssets();
							renderAssetPickerList();
						},
					}),
				);
			}
		}

		function renderConnEditor() {
			connEditorTitle.textContent = state.connEditorMode === "edit" ? "编辑后台任务" : "新建后台任务";
			connEditorTargetCurrent.textContent = "task_inbox";
			saveConnEditorButton.textContent = state.connEditorSaving ? "保存中" : "保存";
			connEditorUploadAssetsButton.disabled = state.connEditorSaving || state.connEditorUploadingAssets;
			connEditorUploadAssetsButton.textContent = state.connEditorUploadingAssets ? "上传中" : "上传新文件";
			renderConnEditorAgentOptions();
			renderConnEditorBrowserOptions();
			renderConnEditorModelOptions();
			renderConnEditorError(state.connEditorError);
			renderConnEditorSelectedAssets();
			setConnEditorSectionVisibility();
			saveConnEditorButton.disabled = state.connEditorSaving || state.connEditorUploadingAssets || !isConnEditorTeamGroupSelectionReady();
		}

		async function uploadConnEditorFiles(files) {
			const selectedFiles = Array.from(files || []);
			if (selectedFiles.length === 0) {
				return;
			}
			state.connEditorUploadingAssets = true;
			renderConnEditorError("");
			renderConnEditor();
			try {
				const connAssetConversationId =
					state.connEditorMode === "edit" && state.connEditorConnId
						? "conn:" + state.connEditorConnId
						: "conn:draft";
				const assets = await uploadFilesAsAssets(selectedFiles, {
					conversationId: connAssetConversationId,
				});
				mergeRecentAssets(assets);
				state.connEditorSelectedAssetRefs = Array.from(
					new Set([
						...state.connEditorSelectedAssetRefs,
						...assets
							.map((asset) => String(asset?.assetId || "").trim())
							.filter(Boolean),
					]),
				);
				connEditorAssetRefs.value = state.connEditorSelectedAssetRefs.join("\\\\n");
				renderConnEditorSelectedAssets();
				renderAssetPickerList();
			} finally {
				state.connEditorUploadingAssets = false;
				renderConnEditor();
			}
		}

		function buildConnTargetPayload() {
			const targetType = String(connEditorTargetType.value || "task_inbox").trim();
			if (targetType === "task_inbox") {
				return { type: "task_inbox" };
			}
			const targetId = String(connEditorTargetId.value || "").trim();
			if (!targetId) {
				throw new Error("请填写目标 ID");
			}
			if (targetType === "feishu_chat") {
				return { type: "feishu_chat", chatId: targetId };
			}
			if (targetType === "feishu_user") {
				return { type: "feishu_user", openId: targetId };
			}
			return { type: "task_inbox" };
		}

		function buildConnSchedulePayload() {
			const kind = String(connEditorScheduleKind.value || "once").trim();
			if (kind === "interval") {
				const minutes = Number.parseInt(String(connEditorIntervalMinutes.value || ""), 10);
				if (!Number.isFinite(minutes) || minutes < 1) {
					throw new Error("间隔分钟必须大于 0");
				}
				const startAt = parseConnDateTimeLocal(connEditorIntervalStart.value);
				if (!startAt) {
					throw new Error("请填写首次执行时间");
				}
				return { kind: "interval", everyMs: minutes * 60 * 1000, startAt };
			}
			if (kind === "daily") {
				const expression = buildConnDailyCronExpression();
				if (!expression) {
					throw new Error("请填写每日执行时间");
				}
				return { kind: "cron", expression, timezone: getLocalTimezone() };
			}
			const at = parseConnDateTimeLocal(connEditorOnceAt.value);
			if (!at) {
				throw new Error("请填写执行时间");
			}
			return { kind: "once", at };
		}

		function buildConnExecutionPayload() {
			if (getConnEditorExecutionType() !== "team_group") {
				return { type: "agent_prompt" };
			}
			const groupId = String(connEditorTeamGroupId?.value || "").trim();
			const group = findConnEditorTeamTaskGroup(groupId);
			if (!group || !isUsableTeamTaskGroup(group)) {
				throw new Error("请先选择可运行的 Team Group");
			}
			return { type: "team_group", groupId };
		}

		function getConnEditorTeamGroupPrompt(groupId) {
			const group = findConnEditorTeamTaskGroup(groupId);
			return "Run Team Group: " + (group ? getTeamTaskGroupLabel(group) : groupId);
		}

		function readConnEditorPayload() {
			const title = String(connEditorTitleInput.value || "").trim();
			const prompt = String(connEditorPrompt.value || "").trim();
			const execution = buildConnExecutionPayload();
			if (!title) {
				throw new Error("请填写标题");
			}
			if (execution.type === "agent_prompt" && !prompt) {
				throw new Error("请填写让它做什么");
			}
			const payload = {
				title,
				prompt: execution.type === "team_group" ? (prompt || getConnEditorTeamGroupPrompt(execution.groupId)) : prompt,
				execution,
				target: buildConnTargetPayload(),
				schedule: buildConnSchedulePayload(),
			};
			if (execution.type === "team_group") {
				return payload;
			}
			const modelProvider = String(connEditorModelProvider?.value || "").trim();
			const modelId = String(connEditorModelId?.value || "").trim();
			if (!modelProvider || !modelId) {
				throw new Error("请选择后台任务使用的模型");
			}
			payload.modelProvider = modelProvider;
			payload.modelId = modelId;
			payload.profileId = String(connEditorProfileId?.value || "main").trim() || "main";
			if (state.connEditorMode === "edit" || String(connEditorBrowserId?.value || "").trim()) {
				payload.browserId = connEditorBrowserId.value || null;
			}
			const assetRefs = Array.isArray(state.connEditorSelectedAssetRefs)
				? state.connEditorSelectedAssetRefs.map((assetId) => String(assetId || "").trim()).filter(Boolean)
				: [];
			if (assetRefs.length > 0 || state.connEditorMode === "edit") {
				payload.assetRefs = assetRefs;
			}
			const maxRunSeconds = String(connEditorMaxRunSeconds.value || "").trim();
			if (maxRunSeconds) {
				const seconds = Number(maxRunSeconds);
				if (!Number.isFinite(seconds) || seconds <= 0) {
					throw new Error("最长运行秒数必须大于 0");
				}
				payload.maxRunMs = Math.round(seconds * 1000);
			}
			for (const [field, node] of [
				["agentSpecId", connEditorAgentSpecId],
				["skillSetId", connEditorSkillSetId],
			]) {
				const value = String(node.value || "").trim();
				if (value) {
					payload[field] = value;
				}
			}
			const upgradePolicy = String(connEditorUpgradePolicy.value || "").trim();
			if (upgradePolicy) {
				payload.upgradePolicy = upgradePolicy;
			}
			return payload;
		}

		function getEditingConn() {
			const connId = String(state.connEditorConnId || "").trim();
			if (!connId) {
				return null;
			}
			return (state.connManagerItems || []).find((conn) => String(conn?.connId || "").trim() === connId) || null;
		}

		async function confirmConnExecutionBindingChangeIfNeeded(conn, nextProfileId, nextBrowserId) {
			const currentProfileId = String(conn?.profileId || "main").trim() || "main";
			const normalizedNextProfileId = String(nextProfileId || "main").trim() || "main";
			const currentBrowserId = String(conn?.browserId || "").trim();
			const normalizedNextBrowserId = String(nextBrowserId || "").trim();
			if (currentProfileId === normalizedNextProfileId && currentBrowserId === normalizedNextBrowserId) {
				return true;
			}
			return await openConfirmDialog({
				title: "确认 Conn 执行路由变更",
				description:
					"目标对象：Conn · " +
					(conn?.title || connEditorTitleInput.value || "新后台任务") +
					"\\n当前执行 Agent：" +
					getAgentDisplayName(currentProfileId) +
					"\\n目标执行 Agent：" +
					getAgentDisplayName(normalizedNextProfileId) +
					"\\n当前浏览器：" +
					getConnBrowserLabel(currentBrowserId) +
					"\\n目标浏览器：" +
					(normalizedNextBrowserId ? getConnBrowserLabel(normalizedNextBrowserId) : "跟随执行 Agent") +
					"\\n影响范围：只影响后续 run\\n不会做：不复制 cookie、不迁移 Chrome profile、不启动或关闭 Chrome、不影响正在运行中的任务",
				confirmText: "确认变更",
				cancelText: "取消",
				tone: "danger",
			});
		}

		async function submitConnEditor() {
			if (state.connEditorSaving) {
				return;
			}
			let payload;
			try {
				payload = readConnEditorPayload();
			} catch (error) {
				renderConnEditorError(error instanceof Error ? error.message : "表单校验失败");
				return;
			}

			const isEditing = state.connEditorMode === "edit" && state.connEditorConnId;
			const editingConn = isEditing ? getEditingConn() : null;
			const isPromptExecution = payload.execution?.type !== "team_group";
			const confirmedExecutionBinding = isPromptExecution
				? await confirmConnExecutionBindingChangeIfNeeded(
						editingConn,
						payload.profileId,
						Object.hasOwn(payload, "browserId") ? payload.browserId : "",
					)
				: true;
			if (!confirmedExecutionBinding) {
				return;
			}
			const currentProfileId = String(editingConn?.profileId || "main").trim() || "main";
			const nextProfileId = String(payload.profileId || "main").trim() || "main";
			const currentBrowserId = String(editingConn?.browserId || "").trim();
			const nextBrowserId = String(Object.hasOwn(payload, "browserId") ? payload.browserId || "" : "").trim();
			const executionBindingChanged =
				isPromptExecution && Boolean(isEditing) && (currentProfileId !== nextProfileId || currentBrowserId !== nextBrowserId);

			state.connEditorSaving = true;
			renderConnEditor();
			try {
				const headers = {
					accept: "application/json",
					"content-type": "application/json",
					...(executionBindingChanged
						? {
								"x-ugk-browser-binding-confirmed": "true",
								"x-ugk-browser-binding-source": "playground",
							}
						: {}),
				};
				const response = await fetch(
					isEditing ? "/v1/conns/" + encodeURIComponent(state.connEditorConnId) : "/v1/conns",
					{
						method: isEditing ? "PATCH" : "POST",
						headers,
						body: JSON.stringify(payload),
					},
				);
				const responsePayload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(responsePayload?.error?.message || responsePayload?.message || "保存后台任务失败");
				}
				const savedConn = responsePayload?.conn || null;
				if (savedConn) {
					updateConnManagerConn(savedConn);
				}
				const targetLabel = describeConnTargetSummary(savedConn?.target || payload.target);
				setConnManagerNotice(
					(isEditing ? "已更新" : "已创建") +
						"：" +
						(savedConn?.title || payload.title) +
						"。结果会投递到 " +
						targetLabel +
						"，任务消息页会同步显示。",
					savedConn?.connId || state.connEditorConnId,
				);
				closeConnEditor();
				await loadConnManager({ silent: true });
			} catch (error) {
				renderConnEditorError(error instanceof Error ? error.message : "保存后台任务失败");
			} finally {
				state.connEditorSaving = false;
				if (state.connEditorOpen) {
					renderConnEditor();
				}
			}
		}

	`;
}

export function getConnActivityApiScript(): string {
	return `
		async function fetchConnRunDetail(entry) {
			const response = await fetch(
				"/v1/conns/" + encodeURIComponent(entry.sourceId) + "/runs/" + encodeURIComponent(entry.runId),
				{
					method: "GET",
					headers: { accept: "application/json" },
				},
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法获取后台任务详情";
				throw new Error(errorMessage);
			}
			return payload;
		}

		const CONN_RUN_LOG_PAGE_SIZE = 2;
		const CONN_RUN_LOG_MAX_CHARS = 900;

		function trimConnRunLogText(text) {
			const normalizedText = String(text || "");
			if (normalizedText.length <= CONN_RUN_LOG_MAX_CHARS) {
				return normalizedText;
			}
			return normalizedText.slice(0, CONN_RUN_LOG_MAX_CHARS).trimEnd() + "\\n...[truncated]";
		}

		async function fetchConnRunEvents(entry, before) {
			const params = new URLSearchParams({ limit: String(CONN_RUN_LOG_PAGE_SIZE) });
			if (before) {
				params.set("before", String(before));
			}
			const response = await fetch(
				"/v1/conns/" +
					encodeURIComponent(entry.sourceId) +
					"/runs/" +
					encodeURIComponent(entry.runId) +
					"/events?" +
					params.toString(),
				{
					method: "GET",
					headers: { accept: "application/json" },
				},
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法获取后台任务事件";
				throw new Error(errorMessage);
			}
			return {
				events: Array.isArray(payload?.events) ? payload.events : [],
				hasMore: Boolean(payload?.hasMore),
				nextBefore: payload?.nextBefore ? String(payload.nextBefore) : "",
			};
		}

		async function fetchConnRunsForConn(conn) {
			const response = await fetch("/v1/conns/" + encodeURIComponent(conn.connId) + "/runs", {
				method: "GET",
				headers: { accept: "application/json" },
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法读取后台任务运行历史";
				throw new Error(errorMessage);
			}
			return Array.isArray(payload?.runs) ? payload.runs : [];
		}

		async function fetchConnList() {
			const response = await fetch("/v1/conns", {
				method: "GET",
				headers: { accept: "application/json" },
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法读取后台任务列表";
				throw new Error(errorMessage);
			}
			applyConnManagerUnreadCount(payload);
			return Array.isArray(payload?.conns) ? payload.conns : [];
		}

		async function fetchTeamTaskGroups() {
			if (state.connEditorTeamTaskGroupsLoaded) {
				return state.connEditorTeamTaskGroups;
			}
			if (state.connEditorTeamTaskGroupsPromise) {
				return state.connEditorTeamTaskGroupsPromise;
			}
			state.connEditorTeamTaskGroupsLoading = true;
			state.connEditorTeamTaskGroupsError = "";
			if (state.connEditorOpen) {
				renderConnEditorTeamGroupOptions();
			}
			state.connEditorTeamTaskGroupsPromise = fetch("/v1/team/task-groups", {
				method: "GET",
				headers: { accept: "application/json" },
			})
				.then(async (response) => {
					const payload = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(payload?.error?.message || payload?.message || "无法读取 Team Group");
					}
					const groups = Array.isArray(payload?.groups)
						? payload.groups
						: Array.isArray(payload?.taskGroups)
							? payload.taskGroups
							: [];
					state.connEditorTeamTaskGroups = groups;
					state.connEditorTeamTaskGroupsLoaded = true;
					return groups;
				})
				.catch((error) => {
					state.connEditorTeamTaskGroups = [];
					state.connEditorTeamTaskGroupsLoaded = false;
					state.connEditorTeamTaskGroupsError = error instanceof Error ? error.message : "无法读取 Team Group";
					return [];
				})
				.finally(() => {
					state.connEditorTeamTaskGroupsLoading = false;
					state.connEditorTeamTaskGroupsPromise = null;
					if (state.connEditorOpen) {
						renderConnEditor();
					}
				});
			return state.connEditorTeamTaskGroupsPromise;
		}

		function applyConnManagerUnreadCount(payload) {
			state.connManagerUnreadCount = Math.max(0, Number(payload?.totalUnreadRuns) || 0);
			state.connManagerUnreadCountsByConnId = payload?.unreadRunCountsByConnId || {};
			state.connManagerUnreadLatestRunTimesByConnId = payload?.unreadLatestRunTimesByConnId || {};
			renderTaskInboxToggleState();
			return state.connManagerUnreadCount;
		}

		async function syncConnManagerUnreadSummary(options) {
			try {
				await fetchConnList();
			} catch (error) {
				if (!options?.silent) {
					const messageText = error instanceof Error ? error.message : "无法读取后台任务未读数";
					showError(messageText);
				}
			}
		}

		async function hydrateConnManagerRunsFromList(conns) {
			const runsByConnId = {};
			const runsLoadedByConnId = {};
			const legacyConns = [];
			for (const conn of Array.isArray(conns) ? conns : []) {
				if (!conn?.connId) {
					continue;
				}
				if (Object.prototype.hasOwnProperty.call(conn, "latestRun")) {
					runsByConnId[conn.connId] = conn.latestRun ? [conn.latestRun] : [];
					runsLoadedByConnId[conn.connId] = !conn.latestRun;
				} else {
					legacyConns.push(conn);
				}
			}

			let cursor = 0;
			const workerCount = Math.min(4, legacyConns.length);
			await Promise.all(
				Array.from({ length: workerCount }, async () => {
					for (;;) {
						const conn = legacyConns[cursor++];
						if (!conn) {
							return;
						}
						try {
							runsByConnId[conn.connId] = await fetchConnRunsForConn(conn);
						} catch {
							runsByConnId[conn.connId] = [];
						}
						runsLoadedByConnId[conn.connId] = true;
					}
				}),
			);

			return { runsByConnId, runsLoadedByConnId };
		}

		async function bulkDeleteConns(connIds) {
			const response = await fetch("/v1/conns/bulk-delete", {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: JSON.stringify({ connIds }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法批量删除后台任务";
				throw new Error(errorMessage);
			}
			return {
				deletedConnIds: Array.isArray(payload?.deletedConnIds) ? payload.deletedConnIds : [],
				missingConnIds: Array.isArray(payload?.missingConnIds) ? payload.missingConnIds : [],
			};
		}

		async function loadConnManager(options) {
			if (!options?.silent) {
				clearError();
			}
			refreshConnManagerButton.disabled = true;
			connManagerList.setAttribute("aria-busy", "true");
			try {
				const conns = await fetchConnList();
				const { runsByConnId, runsLoadedByConnId } = await hydrateConnManagerRunsFromList(conns);
				state.connManagerItems = conns;
				state.connManagerRunsByConnId = runsByConnId;
				state.connManagerRunsLoadedByConnId = runsLoadedByConnId;
				state.connManagerRunsLoadingByConnId = {};
				syncConnManagerSelectionWithItems();
				renderConnManager();
				state.connManagerLoadedOnce = true;
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取后台任务列表";
				showError(messageText);
				connManagerList.innerHTML = "";
				const empty = document.createElement("div");
				empty.className = "asset-empty";
				empty.textContent = messageText;
				connManagerList.appendChild(empty);
			} finally {
				refreshConnManagerButton.disabled = false;
				connManagerList.removeAttribute("aria-busy");
			}
		}

	`;
}

export function getConnActivityRendererScript(): string {
	return `
		function canOpenConnRunDetails(entry) {
			return entry?.source === "conn" && Boolean(entry.sourceId) && Boolean(entry.runId);
		}

		function formatConnRunTimestamp(value) {
			if (!value) {
				return "";
			}
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
		}

		function isConnRunTimedOut(run, events) {
			const hasTimeoutEvent = Array.isArray(events) && events.some((event) => event?.eventType === "run_timed_out");
			const errorText = String(run?.errorText || run?.resultSummary || "");
			return hasTimeoutEvent || /exceeded maxRunMs/i.test(errorText);
		}

		function resolveConnRunHealthLabel(run, events) {
			if (!run || typeof run !== "object") {
				return "unknown";
			}
			if (run.status === "failed" && isConnRunTimedOut(run, events)) {
				return "failed / timed out";
			}
			if (run.status !== "running") {
				return run.status || "unknown";
			}
			if (!run.leaseUntil) {
				return "running / lease unknown";
			}
			const leaseUntil = new Date(run.leaseUntil);
			if (Number.isNaN(leaseUntil.getTime())) {
				return "running / lease unreadable";
			}
			return leaseUntil.getTime() <= Date.now() ? "running / stale suspected" : "running / lease active";
		}

		function describeConnStatusLabel(status) {
			return CONN_STATUS_LABELS[String(status || "").trim()] || String(status || "未知状态");
		}

		function describeConnRunStatusLabel(status) {
			return CONN_RUN_STATUS_LABELS[String(status || "").trim()] || String(status || "未知结果");
		}

		function describeActivitySourceLabel(source, kind) {
			const normalizedSource = String(source || "").trim();
			if (normalizedSource && ACTIVITY_SOURCE_LABELS[normalizedSource]) {
				return ACTIVITY_SOURCE_LABELS[normalizedSource];
			}
			return String(kind || source || "活动").trim() || "活动";
		}

		function formatConnIntervalLabel(everyMs) {
			const minutes = Math.round(Number(everyMs) / 60000);
			if (!Number.isFinite(minutes) || minutes <= 0) {
				return "按间隔重复";
			}
			if (minutes % (24 * 60) === 0) {
				return "每 " + minutes / (24 * 60) + " 天";
			}
			if (minutes % 60 === 0) {
				return "每 " + minutes / 60 + " 小时";
			}
			return "每 " + minutes + " 分钟";
		}

		function formatConnMaxRunLabel(maxRunMs) {
			const seconds = Math.round(Number(maxRunMs) / 1000);
			if (!Number.isFinite(seconds) || seconds <= 0) {
				return "";
			}
			if (seconds % 60 === 0) {
				return seconds / 60 + " 分钟";
			}
			return seconds + " 秒";
		}

		function describeConnScheduleSummary(schedule) {
			if (!schedule || typeof schedule !== "object") {
				return "执行方式未配置";
			}
			if (schedule.kind === "cron") {
				const parsed = parseConnCronExpression(schedule.expression);
				if (
					parsed &&
					parsed.dayOfMonth === "*" &&
					parsed.month === "*" &&
					parsed.dayOfWeek === "*"
				) {
					return "每日执行 · " + (formatConnTimeOfDay(parsed.hour, parsed.minute) || "时间待定");
				}
				return "按规则执行 · " + (schedule.expression || "未配置");
			}
			if (schedule.kind === "interval") {
				const parts = ["间隔执行 · " + formatConnIntervalLabel(schedule.everyMs)];
				if (schedule.startAt) {
					parts.push("首次 " + formatConnRunTimestamp(schedule.startAt));
				}
				return parts.join(" · ");
			}
			if (schedule.kind === "once") {
				return "定时执行 · " + formatConnRunTimestamp(schedule.at);
			}
			return String(schedule.kind || "执行方式未配置");
		}

		function describeConnTargetSummary(target) {
			if (!target || typeof target !== "object") {
				return "任务消息";
			}
			if (target.type === "task_inbox" || target.type === "conversation") {
				return "任务消息";
			}
			if (target.type === "feishu_chat") {
				return "飞书群 / " + (target.chatId || "未填写");
			}
			if (target.type === "feishu_user") {
				return "飞书用户 / " + (target.openId || "未填写");
			}
			return String(target.type || "未知目标");
		}

		function describeConnTimingSummary(conn) {
			const parts = [];
			if (conn?.nextRunAt) {
				parts.push("下次 " + formatConnRunTimestamp(conn.nextRunAt));
			} else if (conn?.status === "completed") {
				parts.push("已完成，不再自动执行");
			} else {
				parts.push("下次执行待定");
			}
			if (conn?.lastRunAt) {
				parts.push("最近 " + formatConnRunTimestamp(conn.lastRunAt));
			}
			if (conn?.maxRunMs) {
				const maxRunLabel = formatConnMaxRunLabel(conn.maxRunMs);
				if (maxRunLabel) {
					parts.push("最长等待 " + maxRunLabel);
				}
			}
			return parts.join(" · ");
		}

		function createConnActionButton(text, onClick, options) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = text;
			button.disabled = Boolean(options?.disabled);
			if (options?.className) {
				button.className = options.className;
			}
			button.addEventListener("click", onClick);
			return button;
		}

		function isConnRunInFlight(run) {
			return run?.status === "pending" || run?.status === "running";
		}

		function hasConnManagerRunInFlight(connId) {
			const runs = Array.isArray(state.connManagerRunsByConnId[connId])
				? state.connManagerRunsByConnId[connId]
				: [];
			if (runs.some(isConnRunInFlight)) {
				return true;
			}
			const conn = Array.isArray(state.connManagerItems)
				? state.connManagerItems.find((item) => item?.connId === connId)
				: null;
			return isConnRunInFlight(conn?.latestRun);
		}

		async function refreshConnManagerRuns(connId) {
			const conn = Array.isArray(state.connManagerItems)
				? state.connManagerItems.find((item) => item?.connId === connId)
				: null;
			if (!conn) {
				return;
			}
			state.connManagerRunsLoadingByConnId = {
				...state.connManagerRunsLoadingByConnId,
				[connId]: true,
			};
			try {
				const runs = await fetchConnRunsForConn(conn);
				state.connManagerRunsByConnId = {
					...state.connManagerRunsByConnId,
					[connId]: runs,
				};
				state.connManagerRunsLoadedByConnId = {
					...state.connManagerRunsLoadedByConnId,
					[connId]: true,
				};
			} finally {
				const nextLoading = { ...state.connManagerRunsLoadingByConnId };
				delete nextLoading[connId];
				state.connManagerRunsLoadingByConnId = nextLoading;
				if (state.connManagerOpen) {
					renderConnManager();
				}
			}
		}

		function scheduleConnManagerRunRefresh(connId, attempt) {
			if (!connId || attempt >= CONN_RUN_REFRESH_MAX_ATTEMPTS) {
				if (connId && state.connManagerRunRefreshTimers[connId]) {
					clearTimeout(state.connManagerRunRefreshTimers[connId]);
					delete state.connManagerRunRefreshTimers[connId];
				}
				return;
			}
			if (state.connManagerRunRefreshTimers[connId]) {
				clearTimeout(state.connManagerRunRefreshTimers[connId]);
			}
			state.connManagerRunRefreshTimers[connId] = setTimeout(async () => {
				try {
					await refreshConnManagerRuns(connId);
					if (hasConnManagerRunInFlight(connId)) {
						scheduleConnManagerRunRefresh(connId, attempt + 1);
					} else {
						delete state.connManagerRunRefreshTimers[connId];
					}
				} catch (error) {
					const messageText = error instanceof Error ? error.message : "无法刷新后台运行状态";
					showError(messageText);
					scheduleConnManagerRunRefresh(connId, attempt + 1);
				}
			}, CONN_RUN_REFRESH_DELAY_MS);
		}

		function setConnManagerNotice(message, connId) {
			state.connManagerNotice = String(message || "").trim();
			state.connManagerHighlightedConnId = String(connId || "").trim();
			if (connManagerNotice) {
				connManagerNotice.textContent = state.connManagerNotice;
				connManagerNotice.hidden = !state.connManagerNotice;
			}
		}

		function getConnManagerSelectedSet() {
			return new Set(
				(Array.isArray(state.connManagerSelectedConnIds) ? state.connManagerSelectedConnIds : [])
					.map((connId) => String(connId || "").trim())
					.filter(Boolean),
			);
		}

		function setConnManagerSelectedIds(connIds) {
			state.connManagerSelectedConnIds = Array.from(
				new Set(
					(Array.isArray(connIds) ? connIds : [])
						.map((connId) => String(connId || "").trim())
						.filter(Boolean),
				),
			);
		}

		function syncConnManagerSelectionWithItems() {
			const existingConnIds = new Set(
				(Array.isArray(state.connManagerItems) ? state.connManagerItems : [])
					.map((conn) => String(conn?.connId || "").trim())
					.filter(Boolean),
			);
			setConnManagerSelectedIds(state.connManagerSelectedConnIds.filter((connId) => existingConnIds.has(connId)));
		}

		function getVisibleConnManagerItems() {
			const filter = String(state.connManagerFilter || "all");
			const conns = Array.isArray(state.connManagerItems) ? state.connManagerItems : [];
			if (filter === "all") {
				return conns;
			}
			return conns.filter((conn) => conn?.status === filter);
		}

		function updateConnManagerToolbar() {
			syncConnManagerSelectionWithItems();
			const selectedCount = state.connManagerSelectedConnIds.length;
			const visibleCount = getVisibleConnManagerItems().length;
			if (connManagerFilter && connManagerFilter.value !== state.connManagerFilter) {
				connManagerFilter.value = state.connManagerFilter;
			}
			if (connManagerSelectedCount) {
				connManagerSelectedCount.textContent = "已选 " + selectedCount;
			}
			if (selectVisibleConnsButton) {
				selectVisibleConnsButton.disabled = visibleCount === 0 || Boolean(state.connManagerActionConnId);
			}
			if (clearSelectedConnsButton) {
				clearSelectedConnsButton.disabled = selectedCount === 0 || Boolean(state.connManagerActionConnId);
			}
			if (deleteSelectedConnsButton) {
				deleteSelectedConnsButton.disabled = selectedCount === 0 || Boolean(state.connManagerActionConnId);
				deleteSelectedConnsButton.textContent = state.connManagerActionKind === "bulk-delete" ? "删除中" : "删除所选";
			}
		}

		function selectVisibleConns() {
			setConnManagerSelectedIds(getVisibleConnManagerItems().map((conn) => conn.connId));
			renderConnManager();
		}

		function clearSelectedConns() {
			setConnManagerSelectedIds([]);
			renderConnManager();
		}

		function toggleConnManagerSelection(conn, checked) {
			if (!conn?.connId || state.connManagerActionConnId) {
				return;
			}
			const selected = getConnManagerSelectedSet();
			if (checked) {
				selected.add(conn.connId);
			} else {
				selected.delete(conn.connId);
			}
			setConnManagerSelectedIds(Array.from(selected));
			renderConnManager();
		}

		function updateConnManagerConn(nextConn) {
			if (!nextConn?.connId) {
				return;
			}
			let replaced = false;
			state.connManagerItems = state.connManagerItems.map((conn) => {
				if (conn?.connId !== nextConn.connId) {
					return conn;
				}
				replaced = true;
				return nextConn;
			});
			if (!replaced) {
				state.connManagerItems = [nextConn, ...state.connManagerItems];
			}
		}

		function prependConnManagerRun(connId, run) {
			if (!run || !connId) {
				return;
			}
			const currentRuns = Array.isArray(state.connManagerRunsByConnId[connId])
				? state.connManagerRunsByConnId[connId]
				: [];
			state.connManagerRunsByConnId = {
				...state.connManagerRunsByConnId,
				[connId]: [run, ...currentRuns.filter((current) => current?.runId !== run.runId)],
			};
		}

		async function ensureConnManagerRunsLoaded(conn) {
			if (!conn?.connId) {
				return;
			}
			const connId = conn.connId;
			if (state.connManagerRunsLoadedByConnId[connId] || state.connManagerRunsLoadingByConnId[connId]) {
				return;
			}
			state.connManagerRunsLoadingByConnId = {
				...state.connManagerRunsLoadingByConnId,
				[connId]: true,
			};
			renderConnManager();
			try {
				const runs = await fetchConnRunsForConn(conn);
				state.connManagerRunsByConnId = {
					...state.connManagerRunsByConnId,
					[connId]: runs,
				};
				state.connManagerRunsLoadedByConnId = {
					...state.connManagerRunsLoadedByConnId,
					[connId]: true,
				};
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取后台任务运行历史";
				showError(messageText);
			} finally {
				const nextLoading = { ...state.connManagerRunsLoadingByConnId };
				delete nextLoading[connId];
				state.connManagerRunsLoadingByConnId = nextLoading;
				if (state.connManagerOpen) {
					renderConnManager();
				}
			}
		}

		function buildConnRunManagerEntry(conn, run) {
			return {
				kind: "notification",
				source: "conn",
				sourceId: conn.connId,
				runId: run.runId,
				title: (conn.title || "Conn") + " · " + describeConnRunStatusLabel(run.status),
			};
		}

		function renderConnManagerRunList(conn, container) {
			const runs = Array.isArray(state.connManagerRunsByConnId[conn.connId])
				? state.connManagerRunsByConnId[conn.connId].slice(0, 3)
				: [];
			const runsLoaded = Boolean(state.connManagerRunsLoadedByConnId[conn.connId]);
			const runsLoading = Boolean(state.connManagerRunsLoadingByConnId[conn.connId]);
			const details = document.createElement("details");
			details.className = "conn-manager-run-details";
			details.open = Array.isArray(state.connManagerExpandedRunConnIds)
				? state.connManagerExpandedRunConnIds.includes(conn.connId)
				: false;
			details.addEventListener("toggle", () => {
				const expandedIds = new Set(
					Array.isArray(state.connManagerExpandedRunConnIds) ? state.connManagerExpandedRunConnIds : [],
				);
				if (details.open) {
					expandedIds.add(conn.connId);
					state.connManagerExpandedRunConnIds = Array.from(expandedIds);
					if (!runsLoaded && !runsLoading) {
						void ensureConnManagerRunsLoaded(conn);
					}
				} else {
					expandedIds.delete(conn.connId);
					state.connManagerExpandedRunConnIds = Array.from(expandedIds);
				}
			});
			const summary = document.createElement("summary");
			summary.className = "conn-manager-run-summary";
			if (runs.length === 0) {
				summary.textContent = runsLoading ? "正在读取运行记录..." : "暂无运行记录";
				details.appendChild(summary);
				container.appendChild(details);
				return;
			}

			const latestRun = runs[0];
			summary.textContent =
				"最近执行：" +
				describeConnRunStatusLabel(latestRun.status) +
				" · " +
				formatConnRunTimestamp(latestRun.finishedAt || latestRun.startedAt || latestRun.scheduledAt || "") +
				(runsLoading ? " · 正在读取更多" : "");
			details.appendChild(summary);

			const list = document.createElement("div");
			list.className = "conn-manager-run-list";
			for (const run of runs) {
				const item = document.createElement("div");
				item.className = "conn-manager-run-item";
				const copy = document.createElement("div");
				copy.className = "conn-manager-run-copy";
				const title = document.createElement("code");
				title.textContent = describeConnRunStatusLabel(run.status) + " / " + (run.runId || "");
				const meta = document.createElement("span");
				meta.textContent =
					"计划 " +
					formatConnRunTimestamp(run.scheduledAt) +
					(run.finishedAt ? " · 完成 " + formatConnRunTimestamp(run.finishedAt) : "");
				copy.appendChild(title);
				copy.appendChild(meta);
				const actions = document.createElement("div");
				actions.className = "conn-manager-run-actions";
				const openButton = document.createElement("button");
				openButton.type = "button";
				openButton.textContent = "查看执行过程";
				openButton.addEventListener("click", () => {
					closeConnManager();
					void openConnRunDetails(
						buildConnRunManagerEntry(conn, run),
						state.connManagerRestoreFocusElement || openConnManagerButton,
					);
				});
				actions.appendChild(openButton);
				item.appendChild(copy);
				item.appendChild(actions);
				list.appendChild(item);
			}
			details.appendChild(list);
			container.appendChild(details);
		}


		function getConnUnreadTimeMs(conn) {
			const count = state.connManagerUnreadCountsByConnId?.[conn?.connId] || 0;
			if (count <= 0) {
				return 0;
			}
			const explicitTime = Date.parse(String(state.connManagerUnreadLatestRunTimesByConnId?.[conn?.connId] || ""));
			if (Number.isFinite(explicitTime)) {
				return explicitTime;
			}
			const latestRun = conn?.latestRun || null;
			if (latestRun && !latestRun.readAt && (latestRun.status === "succeeded" || latestRun.status === "failed")) {
				return getFirstValidTimeMs([
					latestRun.finishedAt,
					latestRun.updatedAt,
					latestRun.createdAt,
				]);
			}
			return getConnLatestRunTimeMs(conn);
		}

		function getConnLifecycleSortRank(conn) {
			if (conn?.status === "active") return 1;
			if (conn?.status === "paused") return 2;
			if (conn?.status === "completed") return 3;
			return 4;
		}

		function getConnLatestRunTimeMs(conn) {
			const latestRun = conn?.latestRun || null;
			const candidates = [
				latestRun?.startedAt,
				latestRun?.claimedAt,
				latestRun?.finishedAt,
				latestRun?.scheduledAt,
				latestRun?.createdAt,
				latestRun?.updatedAt,
				conn?.lastRunAt,
				conn?.updatedAt,
				conn?.createdAt,
			];
			for (const value of candidates) {
				const time = Date.parse(String(value || ""));
				if (Number.isFinite(time)) {
					return time;
				}
			}
			return 0;
		}

		function getConnNextRunTimeMs(conn) {
			return getFirstValidTimeMs([conn?.nextRunAt]);
		}

		function getFirstValidTimeMs(candidates) {
			for (const value of candidates || []) {
				const time = Date.parse(String(value || ""));
				if (Number.isFinite(time)) {
					return time;
				}
			}
			return 0;
		}

		function compareConnManagerItems(left, right) {
			const leftUnreadTime = getConnUnreadTimeMs(left);
			const rightUnreadTime = getConnUnreadTimeMs(right);
			if ((leftUnreadTime > 0) !== (rightUnreadTime > 0)) {
				return leftUnreadTime > 0 ? -1 : 1;
			}
			if (leftUnreadTime !== rightUnreadTime) {
				return rightUnreadTime - leftUnreadTime;
			}
			const leftRank = getConnLifecycleSortRank(left);
			const rightRank = getConnLifecycleSortRank(right);
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}
			const leftNextRunTime = getConnNextRunTimeMs(left);
			const rightNextRunTime = getConnNextRunTimeMs(right);
			if ((leftNextRunTime > 0) !== (rightNextRunTime > 0)) {
				return leftNextRunTime > 0 ? -1 : 1;
			}
			if (leftNextRunTime !== rightNextRunTime) {
				return leftNextRunTime - rightNextRunTime;
			}
			const leftTime = getConnLatestRunTimeMs(left);
			const rightTime = getConnLatestRunTimeMs(right);
			if (leftTime !== rightTime) {
				return rightTime - leftTime;
			}
			const leftTitle = String(left?.title || "").trim();
			const rightTitle = String(right?.title || "").trim();
			const titleCompare = leftTitle.localeCompare(rightTitle, "zh-CN");
			if (titleCompare !== 0) {
				return titleCompare;
			}
			return String(left?.connId || "").localeCompare(String(right?.connId || ""));
		}

		function renderConnManager() {
			connManagerList.innerHTML = "";
			setConnManagerNotice(state.connManagerNotice, state.connManagerHighlightedConnId);
			updateConnManagerToolbar();
			const conns = Array.isArray(state.connManagerItems) ? state.connManagerItems : [];
			const visibleConns = getVisibleConnManagerItems().slice().sort(compareConnManagerItems);
			if (conns.length === 0) {
				const empty = document.createElement("div");
				empty.className = "asset-empty";
				empty.textContent = "暂无后台任务。点击新建创建一个 conn。";
				connManagerList.appendChild(empty);
				return;
			}
			if (visibleConns.length === 0) {
				const empty = document.createElement("div");
				empty.className = "asset-empty";
				empty.textContent = "当前筛选下没有后台任务。";
				connManagerList.appendChild(empty);
				return;
			}
			const selected = getConnManagerSelectedSet();
			const isBulkAction = state.connManagerActionConnId === "__bulk_delete__";
			for (const conn of visibleConns) {
				const item = document.createElement("article");
				item.className = "conn-manager-item";
				if (state.connManagerHighlightedConnId && conn.connId === state.connManagerHighlightedConnId) {
					item.classList.add("is-highlighted");
				}
				const selectLabel = document.createElement("label");
				selectLabel.className = "conn-manager-select";
				const selectInput = document.createElement("input");
				selectInput.type = "checkbox";
				selectInput.checked = selected.has(conn.connId);
				selectInput.disabled = Boolean(state.connManagerActionConnId);
				selectInput.setAttribute("aria-label", "选择后台任务 " + (conn.title || conn.connId));
				selectInput.addEventListener("change", () => {
					toggleConnManagerSelection(conn, selectInput.checked);
				});
				selectLabel.appendChild(selectInput);
				const main = document.createElement("div");
				main.className = "conn-manager-main";
				const titleRow = document.createElement("div");
				titleRow.className = "conn-manager-title-row";
				const title = document.createElement("strong");
				title.textContent = conn.title || conn.connId || "Conn";
				const status = document.createElement("span");
				status.className = "conn-manager-status " + (conn.status || "unknown");
				status.textContent = describeConnStatusLabel(conn.status);
				titleRow.appendChild(title);
				titleRow.appendChild(status);
				const meta = document.createElement("div");
				meta.className = "conn-manager-meta";
				const targetLine = document.createElement("span");
				targetLine.textContent = "结果发到：";
				const targetCode = document.createElement("code");
				targetCode.textContent = describeConnTargetSummary(conn.target);
				targetLine.appendChild(targetCode);
				const scheduleLine = document.createElement("span");
				scheduleLine.textContent = "执行方式：";
				const scheduleCode = document.createElement("code");
				scheduleCode.textContent = describeConnScheduleSummary(conn.schedule);
				scheduleLine.appendChild(scheduleCode);
				const timeLine = document.createElement("span");
				timeLine.textContent = "运行节奏：" + describeConnTimingSummary(conn);
				const executionLine = document.createElement("span");
				executionLine.textContent = "执行对象：";
				const executionCode = document.createElement("code");
				executionCode.textContent = describeConnExecution(conn);
				executionLine.appendChild(executionCode);
				const agentLine = document.createElement("span");
				agentLine.textContent = "执行 Agent：";
				const agentCode = document.createElement("code");
				agentCode.textContent = getAgentDisplayName(conn.profileId || "main");
				agentLine.appendChild(agentCode);
				const browserLine = document.createElement("span");
				browserLine.textContent = "浏览器：";
				const browserCode = document.createElement("code");
				browserCode.textContent = getConnBrowserLabel(conn.browserId || "");
				browserLine.appendChild(browserCode);
				const modelLine = document.createElement("span");
				modelLine.textContent = "模型：";
				const modelCode = document.createElement("code");
				modelCode.textContent =
					conn.modelProvider && conn.modelId
						? conn.modelProvider + " / " + conn.modelId
						: "跟随默认";
				modelLine.appendChild(modelCode);
				meta.appendChild(targetLine);
				meta.appendChild(scheduleLine);
				meta.appendChild(timeLine);
				meta.appendChild(executionLine);
				if (normalizeConnExecution(conn).type !== "team_group") {
					meta.appendChild(agentLine);
					meta.appendChild(browserLine);
					meta.appendChild(modelLine);
				}
				main.appendChild(titleRow);
				main.appendChild(meta);
				renderConnManagerRunList(conn, main);
				const actions = document.createElement("div");
				actions.className = "conn-manager-actions";
				const isActing = isBulkAction || state.connManagerActionConnId === conn.connId;
				const hasRunInFlight = hasConnManagerRunInFlight(conn.connId);
				const runButton = createConnActionButton(
					state.connManagerActionConnId === conn.connId && state.connManagerActionKind === "run" ? "入队中" : hasRunInFlight ? "执行中" : "立即执行",
					() => {
						void runConnNow(conn);
					},
					{ disabled: isActing || hasRunInFlight },
				);
				const editButton = createConnActionButton(
					"编辑",
					(event) => {
						openConnEditor("edit", conn, event.currentTarget);
					},
					{ disabled: isActing },
				);
				const toggleButton = createConnActionButton(
					state.connManagerActionConnId === conn.connId && state.connManagerActionKind === "toggle"
						? (conn.status === "paused" ? "恢复中" : "暂停中")
						: (conn.status === "paused" ? "恢复" : "暂停"),
					() => {
						void toggleConnPaused(conn);
					},
					{ disabled: isActing || conn.status === "completed" },
				);
				const deleteButton = createConnActionButton(
					state.connManagerActionConnId === conn.connId && state.connManagerActionKind === "delete" ? "删除中" : "删除",
					() => {
						void deleteConn(conn);
					},
					{ disabled: isActing, className: "danger-action" },
				);
				actions.appendChild(runButton);
				actions.appendChild(editButton);
				actions.appendChild(toggleButton);
				actions.appendChild(deleteButton);
				item.appendChild(selectLabel);
				item.appendChild(main);
				item.appendChild(actions);
				connManagerList.appendChild(item);
			}
		}

		async function runConnNow(conn) {
			if (!conn?.connId || state.connManagerActionConnId) {
				return;
			}
			if (hasConnManagerRunInFlight(conn.connId)) {
				setConnManagerNotice("已有一次执行在进行中，请稍等刷新结果", conn.connId);
				renderConnManager();
				return;
			}
			state.connManagerActionConnId = conn.connId;
			state.connManagerActionKind = "run";
			renderConnManager();
			try {
				const response = await fetch("/v1/conns/" + encodeURIComponent(conn.connId) + "/run", {
					method: "POST",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error?.message || payload?.message || "无法创建后台运行");
				}
				prependConnManagerRun(conn.connId, payload?.run);
				state.connManagerExpandedRunConnIds = Array.from(
					new Set([...(Array.isArray(state.connManagerExpandedRunConnIds) ? state.connManagerExpandedRunConnIds : []), conn.connId]),
				);
				setConnManagerNotice("已触发执行，正在后台运行：" + (conn.title || conn.connId), conn.connId);
				scheduleConnManagerRunRefresh(conn.connId, 0);
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法创建后台运行";
				showError(messageText);
			} finally {
				state.connManagerActionConnId = "";
				state.connManagerActionKind = "";
				renderConnManager();
			}
		}

		async function toggleConnPaused(conn) {
			if (!conn?.connId || state.connManagerActionConnId || conn.status === "completed") {
				return;
			}
			state.connManagerActionConnId = conn.connId;
			state.connManagerActionKind = "toggle";
			renderConnManager();
			try {
				const response = await fetch(
					"/v1/conns/" + encodeURIComponent(conn.connId) + (conn.status === "paused" ? "/resume" : "/pause"),
					{
						method: "POST",
						headers: { accept: "application/json" },
					},
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error?.message || payload?.message || "无法更新后台任务状态");
				}
				if (payload?.conn) {
					updateConnManagerConn(payload.conn);
				}
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法更新后台任务状态";
				showError(messageText);
			} finally {
				state.connManagerActionConnId = "";
				state.connManagerActionKind = "";
				renderConnManager();
			}
		}

		async function deleteConn(conn) {
			if (!conn?.connId || state.connManagerActionConnId) {
				return;
			}
			const confirmed = await openConfirmDialog({
				title: "删除后台任务？",
				description: "任务：" + (conn.title || conn.connId) + "\\n\\n删除后会一并移除该任务和它的 run 历史，这个操作不能撤销。",
				confirmText: "删除",
				cancelText: "取消",
				tone: "danger",
			});
			if (!confirmed) {
				return;
			}
			state.connManagerActionConnId = conn.connId;
			state.connManagerActionKind = "delete";
			renderConnManager();
			try {
				const response = await fetch("/v1/conns/" + encodeURIComponent(conn.connId), {
					method: "DELETE",
					headers: { accept: "application/json" },
				});
				if (!response.ok && response.status !== 204) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error?.message || payload?.message || "无法删除后台任务");
				}
				state.connManagerItems = state.connManagerItems.filter((item) => item?.connId !== conn.connId);
				setConnManagerSelectedIds(state.connManagerSelectedConnIds.filter((connId) => connId !== conn.connId));
				const nextRunsByConnId = { ...state.connManagerRunsByConnId };
				delete nextRunsByConnId[conn.connId];
				state.connManagerRunsByConnId = nextRunsByConnId;
				state.connManagerExpandedRunConnIds = state.connManagerExpandedRunConnIds.filter((connId) => connId !== conn.connId);
				setConnManagerNotice("已删除：" + (conn.title || conn.connId), "");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法删除后台任务";
				showError(messageText);
			} finally {
				state.connManagerActionConnId = "";
				state.connManagerActionKind = "";
				renderConnManager();
			}
		}

		async function deleteSelectedConns() {
			if (state.connManagerActionConnId) {
				return;
			}
			const selectedIds = Array.isArray(state.connManagerSelectedConnIds)
				? state.connManagerSelectedConnIds.slice()
				: [];
			if (selectedIds.length === 0) {
				return;
			}
			const selectedTitles = state.connManagerItems
				.filter((conn) => selectedIds.includes(conn?.connId))
				.map((conn) => conn.title || conn.connId)
				.slice(0, 6);
			const confirmed = await openConfirmDialog({
				title: "批量删除后台任务？",
				description:
					"数量：" +
					selectedIds.length +
					(selectedTitles.length > 0 ? "\\n任务：" + selectedTitles.join("、") : "") +
					(selectedIds.length > selectedTitles.length ? "\\n另有 " + (selectedIds.length - selectedTitles.length) + " 个任务" : "") +
					"\\n\\n删除后会一并移除这些任务和它们的 run 历史，这个操作不能撤销。",
				confirmText: "批量删除",
				cancelText: "取消",
				tone: "danger",
			});
			if (!confirmed) {
				return;
			}
			state.connManagerActionConnId = "__bulk_delete__";
			state.connManagerActionKind = "bulk-delete";
			renderConnManager();
			try {
				const result = await bulkDeleteConns(selectedIds);
				const deletedIds = new Set(result.deletedConnIds);
				state.connManagerItems = state.connManagerItems.filter((conn) => !deletedIds.has(conn?.connId));
				const nextRunsByConnId = { ...state.connManagerRunsByConnId };
				for (const connId of deletedIds) {
					delete nextRunsByConnId[connId];
				}
				state.connManagerRunsByConnId = nextRunsByConnId;
				state.connManagerExpandedRunConnIds = state.connManagerExpandedRunConnIds.filter((connId) => !deletedIds.has(connId));
				setConnManagerSelectedIds(state.connManagerSelectedConnIds.filter((connId) => !deletedIds.has(connId)));
				const missingText = result.missingConnIds.length > 0 ? "，" + result.missingConnIds.length + " 个已不存在" : "";
				setConnManagerNotice("已删除 " + result.deletedConnIds.length + " 个后台任务" + missingText, "");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法批量删除后台任务";
				showError(messageText);
			} finally {
				state.connManagerActionConnId = "";
				state.connManagerActionKind = "";
				renderConnManager();
			}
		}

		function appendConnRunDetailRow(section, label, value, options) {
			if (!value) {
				return;
			}
			const row = document.createElement("span");
			row.textContent = label + ": ";
			const node = document.createElement(options?.asCode ? "code" : "strong");
			node.textContent = value;
			row.appendChild(node);
			section.appendChild(row);
		}

		function appendConnRunDetailLinkRow(section, label, href) {
			if (!href) {
				return;
			}
			const row = document.createElement("span");
			row.textContent = label + ": ";
			const link = document.createElement("a");
			link.href = href;
			link.target = "_blank";
			link.rel = "noreferrer";
			link.textContent = "Open JSON";
			row.appendChild(link);
			section.appendChild(row);
		}

		function appendConnRunEvents(list, events) {
			for (const event of events) {
				const item = document.createElement("li");
				item.className = "conn-run-event";
				const title = document.createElement("code");
				title.textContent = "#" + event.seq + " " + event.eventType;
				const meta = document.createElement("span");
				meta.textContent = event.createdAt ? new Date(event.createdAt).toLocaleString() : "";
				const body = document.createElement("span");
				body.textContent = trimConnRunLogText(JSON.stringify(event.event || {}));
				item.appendChild(title);
				item.appendChild(meta);
				item.appendChild(body);
				list.appendChild(item);
			}
		}

		function renderConnRunDetails(entry, detailPayload, eventsPayload) {
			connRunDetailsBody.innerHTML = "";
			const run = detailPayload?.run || {};
			const files = Array.isArray(detailPayload?.files) ? detailPayload.files : [];
			const events = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];

			const summary = document.createElement("section");
			summary.className = "conn-run-section";
			summary.innerHTML = "<strong></strong><code></code><span></span>";
			summary.querySelector("strong").textContent = entry.title || "Conn run";
			summary.querySelector("code").textContent =
				"conn=" + (entry.sourceId || run.connId || "") + " / run=" + (entry.runId || run.runId || "");
			summary.querySelector("span").textContent =
				"status: " +
				(run.status || "unknown") +
				(run.scheduledAt ? " / scheduled: " + new Date(run.scheduledAt).toLocaleString() : "") +
				(run.finishedAt ? " / finished: " + new Date(run.finishedAt).toLocaleString() : "");
			connRunDetailsBody.appendChild(summary);

			const lifecycle = document.createElement("section");
			lifecycle.className = "conn-run-section";
			const lifecycleHeading = document.createElement("strong");
			lifecycleHeading.textContent = "Lifecycle";
			lifecycle.appendChild(lifecycleHeading);
			appendConnRunDetailRow(lifecycle, "health", resolveConnRunHealthLabel(run, events), { asCode: true });
			appendConnRunDetailRow(lifecycle, "claimed", formatConnRunTimestamp(run.claimedAt));
			appendConnRunDetailRow(lifecycle, "started", formatConnRunTimestamp(run.startedAt));
			appendConnRunDetailRow(lifecycle, "updated", formatConnRunTimestamp(run.updatedAt));
			appendConnRunDetailRow(lifecycle, "lease owner", run.leaseOwner, { asCode: true });
			appendConnRunDetailRow(lifecycle, "lease until", formatConnRunTimestamp(run.leaseUntil));
			if (lifecycle.childElementCount > 1) {
				connRunDetailsBody.appendChild(lifecycle);
			}

			const snapshot = run.resolvedSnapshot && typeof run.resolvedSnapshot === "object" ? run.resolvedSnapshot : null;
			if (snapshot) {
				const snapshotExecution = snapshot.execution && typeof snapshot.execution === "object" ? snapshot.execution : null;
				const isTeamGroupRun = snapshotExecution?.type === "team_group" || snapshot.groupId || snapshot.groupRunId || snapshot.groupRunStatus;
				if (isTeamGroupRun) {
					const group = document.createElement("section");
					group.className = "conn-run-section";
					const groupHeading = document.createElement("strong");
					groupHeading.textContent = "Team Group";
					group.appendChild(groupHeading);
					const groupId = String(snapshotExecution?.groupId || snapshot.groupId || "");
					const groupRunId = String(snapshot.groupRunId || "");
					const groupRunStatus = String(snapshot.groupRunStatus || "");
					const groupRunStartStatus = String(snapshot.groupRunStartStatus || "");
					const groupRunStartError = String(snapshot.groupRunStartError || "");
					appendConnRunDetailRow(group, "groupId", groupId, { asCode: true });
					appendConnRunDetailRow(group, "groupRunId", groupRunId, { asCode: true });
					appendConnRunDetailRow(group, "groupRunStatus", groupRunStatus, { asCode: true });
					appendConnRunDetailRow(group, "groupRunStartStatus", groupRunStartStatus, { asCode: true });
					appendConnRunDetailRow(group, "groupRunStartError", groupRunStartError, { asCode: true });
					appendConnRunDetailLinkRow(group, "Group JSON", groupId ? "/v1/team/task-groups/" + encodeURIComponent(groupId) : "");
					appendConnRunDetailLinkRow(group, "GroupRun JSON", groupRunId ? "/v1/team/task-group-runs/" + encodeURIComponent(groupRunId) : "");
					const isSkippedTeamGroupRun = snapshot.skipped === true;
					if (isSkippedTeamGroupRun) {
						appendConnRunDetailRow(group, "Skipped", String(run.resultSummary || "Team Group run was skipped"));
					}
					if (group.childElementCount > 1) {
						connRunDetailsBody.appendChild(group);
					}
				} else {
					const execution = document.createElement("section");
					execution.className = "conn-run-section";
					const executionHeading = document.createElement("strong");
					executionHeading.textContent = "Execution Agent";
					execution.appendChild(executionHeading);
					const requestedAgent = snapshot.requestedAgentId || snapshot.profileId || "";
					const actualAgent = snapshot.agentName || snapshot.agentId || snapshot.profileId || "";
					appendConnRunDetailRow(execution, "requested", requestedAgent ? String(requestedAgent) : "", { asCode: true });
					appendConnRunDetailRow(execution, "actual", actualAgent ? String(actualAgent) : "", { asCode: true });
					if (snapshot.fallbackUsed) {
					appendConnRunDetailRow(
						execution,
						"fallback",
						"原执行 Agent 不可用，已由 " + String(snapshot.agentName || snapshot.agentId || "默认 Agent") + " 完成",
					);
					appendConnRunDetailRow(execution, "reason", String(snapshot.fallbackReason || "profile_not_found"), { asCode: true });
				}
				appendConnRunDetailRow(
					execution,
					"model",
					snapshot.provider && snapshot.model ? String(snapshot.provider) + " / " + String(snapshot.model) : "",
					{ asCode: true },
				);
					if (execution.childElementCount > 1) {
						connRunDetailsBody.appendChild(execution);
					}
				}
			}

			if (run.workspacePath || run.resultText || run.resultSummary || run.errorText) {
				const result = document.createElement("section");
				result.className = "conn-run-section conn-run-result-bubble";
				const resultHeading = document.createElement("strong");
				resultHeading.textContent = "Result";
				result.appendChild(resultHeading);
				const resultText = document.createElement("div");
				resultText.className = "conn-run-result-text message-content";
				const runResultText = run.errorText || run.resultText || run.resultSummary || "No result summary yet";
				if (typeof renderMessageMarkdown === "function") {
					resultText.innerHTML = renderMessageMarkdown(runResultText);
					if (typeof hydrateMarkdownContent === "function") {
						hydrateMarkdownContent(resultText);
					}
				} else {
					resultText.textContent = runResultText;
				}
				result.appendChild(resultText);
				if (run.workspacePath) {
					const workspace = document.createElement("code");
					workspace.textContent = run.workspacePath;
					result.appendChild(workspace);
				}
				connRunDetailsBody.appendChild(result);
			}

			if (files.length > 0) {
				const fileSection = document.createElement("section");
				fileSection.className = "conn-run-section";
				const heading = document.createElement("strong");
				heading.textContent = "Files";
				fileSection.appendChild(heading);
				for (const file of files) {
					const label = (file.kind || "file") + " / " + (file.relativePath || file.fileName || "");
					if (file.url) {
						const link = document.createElement("a");
						link.className = "conn-run-file-link";
						link.href = file.url;
						link.target = "_blank";
						link.rel = "noreferrer";
						link.textContent = label;
						fileSection.appendChild(link);
					} else {
						const line = document.createElement("code");
						line.textContent = label;
						fileSection.appendChild(line);
					}
					if (file.latestUrl) {
						const latestLink = document.createElement("a");
						latestLink.className = "conn-run-file-link conn-run-file-link-secondary";
						latestLink.href = file.latestUrl;
						latestLink.target = "_blank";
						latestLink.rel = "noreferrer";
						latestLink.textContent = "最新入口";
						fileSection.appendChild(latestLink);
					}
				}
				connRunDetailsBody.appendChild(fileSection);
			}

			const eventSection = document.createElement("section");
			eventSection.className = "conn-run-section";
			const heading = document.createElement("strong");
			heading.textContent = "Events";
			eventSection.appendChild(heading);
			const list = document.createElement("ul");
			list.className = "conn-run-event-list";
			appendConnRunEvents(list, events);
			if (events.length === 0) {
				const empty = document.createElement("span");
				empty.textContent = "No events recorded yet";
				eventSection.appendChild(empty);
			} else {
				eventSection.appendChild(list);
				const loadState = document.createElement("span");
				loadState.className = "conn-run-event-load-state";
				eventSection.appendChild(loadState);
				state.connRunDetailsPagination = {
					entry,
					list,
					loadState,
					nextBefore: eventsPayload?.nextBefore || "",
					hasMore: Boolean(eventsPayload?.hasMore),
					loading: false,
				};
				loadState.textContent = state.connRunDetailsPagination.hasMore ? "向下滚动加载更早的事件" : "已显示全部事件";
			}
			connRunDetailsBody.appendChild(eventSection);
		}

		async function loadMoreConnRunEvents() {
			const pagination = state.connRunDetailsPagination;
			if (!pagination || !pagination.hasMore || pagination.loading) {
				return;
			}
			pagination.loading = true;
			pagination.loadState.textContent = "正在加载更早的事件...";
			try {
				const payload = await fetchConnRunEvents(pagination.entry, pagination.nextBefore);
				appendConnRunEvents(pagination.list, payload.events);
				pagination.nextBefore = payload.nextBefore || "";
				pagination.hasMore = Boolean(payload.hasMore);
				pagination.loadState.textContent = pagination.hasMore ? "向下滚动加载更早的事件" : "已显示全部事件";
			} catch (error) {
				pagination.loadState.textContent = error instanceof Error ? error.message : "无法加载更多后台事件";
			} finally {
				pagination.loading = false;
			}
		}

		async function openConnRunDetails(entry, restoreFocusElement) {
			if (!canOpenConnRunDetails(entry)) {
				return;
			}
			state.connRunDetailsRestoreFocusElement = rememberPanelReturnFocus(restoreFocusElement);
			state.connRunDetailsPagination = null;
			connRunDetailsBody.textContent = "正在读取后台任务详情...";
			connRunDetailsDialog.hidden = false;
			connRunDetailsDialog.classList.add("open");
			connRunDetailsDialog.setAttribute("aria-hidden", "false");
			try {
				const [detailPayload, eventsPayload] = await Promise.all([
					fetchConnRunDetail(entry),
					fetchConnRunEvents(entry),
				]);
				renderConnRunDetails(entry, detailPayload, eventsPayload);
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "Failed to load conn run details";
				connRunDetailsBody.textContent = messageText;
			}
		}

	`;
}

export function getConnActivityEventHandlersScript(): string {
	return `
		initializeConnEditorTimePickers();

		refreshConnManagerButton.addEventListener("click", () => {
			void loadConnManager({ silent: false });
		});

		connManagerFilter.addEventListener("change", () => {
			state.connManagerFilter = connManagerFilter.value || "all";
			renderConnManager();
		});

		selectVisibleConnsButton.addEventListener("click", selectVisibleConns);
		clearSelectedConnsButton.addEventListener("click", clearSelectedConns);
		deleteSelectedConnsButton.addEventListener("click", () => {
			void deleteSelectedConns();
		});

		openConnManagerButton.addEventListener("click", () => {
			window.location.assign("/playground/conn");
		});

		openConnEditorButton.addEventListener("click", () => {
			openConnEditor("create", null, openConnEditorButton);
		});

		closeConnManagerButton.addEventListener("click", () => {
			closeConnManager();
		});

		connManagerDialog.addEventListener("click", (event) => {
			if (event.target === connManagerDialog) {
				closeConnManager();
			}
		});

		connEditorExecutionType.addEventListener("change", () => {
			renderConnEditorError("");
			if (getConnEditorExecutionType() === "team_group") {
				void fetchTeamTaskGroups();
			}
			renderConnEditor();
		});
		connEditorTeamGroupId.addEventListener("change", renderConnEditor);
		connEditorTargetType.addEventListener("change", renderConnEditor);
		connEditorTargetId.addEventListener("input", renderConnEditorTargetPreview);
		connEditorScheduleKind.addEventListener("change", renderConnEditor);
		connEditorModelProvider.addEventListener("change", () => {
			connEditorModelId.dataset.pendingValue = "";
			renderConnEditorModelOptions();
		});
		connEditorModelId.addEventListener("change", renderConnEditorModelOptions);
		connEditorForm.addEventListener("submit", (event) => {
			event.preventDefault();
			void submitConnEditor();
		});
		cancelConnEditorButton.addEventListener("click", closeConnEditor);
		closeConnEditorButton.addEventListener("click", closeConnEditor);
		connEditorPickAssetsButton.addEventListener("click", () => {
			openAssetLibrary(connEditorPickAssetsButton, { target: "connEditor" });
		});
		connEditorUploadAssetsButton.addEventListener("click", () => {
			connEditorAssetFileInput.click();
		});
		connEditorAssetFileInput.addEventListener("change", async () => {
			try {
				await uploadConnEditorFiles(connEditorAssetFileInput.files);
			} catch (error) {
				renderConnEditorError(error instanceof Error ? error.message : "文件上传失败");
			} finally {
				connEditorAssetFileInput.value = "";
			}
		});
		connEditorDialog.addEventListener("click", (event) => {
			if (event.target === connEditorDialog) {
				closeConnEditor();
			}
		});

		mobileMenuConnButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			openConnManager(mobileOverflowMenuButton);
		});
		connRunDetailsClose.addEventListener("click", () => {
			closeConnRunDetailsDialog();
		});
		connRunDetailsDialog.addEventListener("click", (event) => {
			if (event.target === connRunDetailsDialog) {
				closeConnRunDetailsDialog();
			}
		});
		connRunDetailsBody.addEventListener("scroll", () => {
			if (connRunDetailsBody.scrollTop + connRunDetailsBody.clientHeight >= connRunDetailsBody.scrollHeight - 32) {
				void loadMoreConnRunEvents();
			}
		});

		function handleConnActivityPanelEscapeKey(event) {
			if (event.key !== "Escape") {
				return false;
			}
			if (state.connEditorOpen) {
				closeConnEditor();
				return true;
			}
			if (state.connManagerOpen) {
				closeConnManager();
			}
			return false;
		}

		function handleConnRunDetailsEscapeKey(event) {
			if (event.key === "Escape" && !connRunDetailsDialog.hidden) {
				closeConnRunDetailsDialog();
			}
		}

	`;
}
