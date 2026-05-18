export const progressMessages = {
	pending: "等待执行",
	creating_workunit: "正在创建工作单元",
	creating_worker_session: "正在创建执行 Agent",
	worker_running: "执行 Agent 正在处理",
	checker_reviewing: "验收 Agent 正在检查",
	worker_revising: "执行 Agent 正在根据反馈修改",
	watcher_reviewing: "复盘 Agent 正在复盘任务",
	finalizer_running: "汇总 Agent 正在生成最终报告",
	writing_result: "正在写入结果文件",
	succeeded: "已通过",
	failed: "失败",
	interrupted: "已中断",
	cancelled: "已取消",
	skipped: "已跳过",
} as const;

export type ProgressPhase = keyof typeof progressMessages;
