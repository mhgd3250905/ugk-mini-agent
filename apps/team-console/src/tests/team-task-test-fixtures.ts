import type { TeamCanvasTask } from "../api/team-types";
import { mockTeamTasks } from "../fixtures/team-fixtures";

export function cloneTaskFixture(task = mockTeamTasks[0]!) {
  return {
    ...task,
    workUnit: {
      ...task.workUnit,
      input: { ...task.workUnit.input },
      inputPorts: task.workUnit.inputPorts ? task.workUnit.inputPorts.map((port) => ({ ...port })) : undefined,
      outputPorts: task.workUnit.outputPorts ? task.workUnit.outputPorts.map((port) => ({ ...port })) : undefined,
      outputContract: { ...task.workUnit.outputContract },
      acceptance: { rules: [...task.workUnit.acceptance.rules] },
    },
  };
}

export function makeTypedTaskChainFixtures() {
  const collectTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_collect_md",
    title: "搜集内容 Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "搜集内容 Task",
      outputPorts: [{ id: "draft_md", label: "Markdown 文稿", type: "md" }],
    },
  };
  const htmlTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_html_build",
    title: "HTML 制作 Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "HTML 制作 Task",
      inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
      outputPorts: [{ id: "page_html", label: "HTML 页面", type: "html" }],
    },
  };
  const ttsTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_tts_fixture",
    title: "TTS Fixture Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "TTS Fixture Task",
      inputPorts: [{ id: "source_html", label: "HTML 文稿", type: "html" }],
      outputPorts: [{ id: "voice_audio", label: "音频", type: "audio" }],
    },
  };
  return { collectTask, htmlTask, ttsTask };
}
