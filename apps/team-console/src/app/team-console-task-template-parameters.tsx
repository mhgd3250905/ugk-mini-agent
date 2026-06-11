import type { ReactNode } from "react";
import type { TeamCanvasTask, TeamTaskTemplateParameter } from "../api/team-types";

export type TaskCloneDraft = {
  title: string;
  templateBindings: Record<string, string>;
};

export type TaskParameterDraft = {
  templateBindings: Record<string, string>;
};

export function templateBindingsForTask(task: TeamCanvasTask): Record<string, string> {
  return Object.fromEntries(
    (task.templateConfig?.parameters ?? []).map((parameter) => [
      parameter.id,
      task.templateState?.currentBindings?.[parameter.id] ?? parameter.defaultValue ?? "",
    ]),
  );
}

function normalizeTemplateParameterValue(parameter: TeamTaskTemplateParameter, rawValue: string): string {
  const value = rawValue.trim();
  if (parameter.inputType === "email_list") {
    return value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",");
  }
  return value;
}

export function hasMissingRequiredTemplateBindings(task: TeamCanvasTask, bindings = templateBindingsForTask(task)): boolean {
  return (task.templateConfig?.parameters ?? []).some((parameter) =>
    parameter.required !== false && !(bindings[parameter.id] ?? "").trim()
  );
}

export function normalizedTemplateBindings(task: TeamCanvasTask, bindings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    (task.templateConfig?.parameters ?? []).flatMap((parameter) => {
      const value = normalizeTemplateParameterValue(parameter, bindings[parameter.id] ?? "");
      return value ? [[parameter.id, value]] : [];
    }),
  );
}

function templateParameterPlaceholder(parameter: TeamTaskTemplateParameter): string {
  return parameter.placeholder ?? parameter.description ?? parameter.id;
}

export function renderTemplateParameterControl(
  parameter: TeamTaskTemplateParameter,
  value: string,
  onChange: (value: string) => void,
): ReactNode {
  const placeholder = templateParameterPlaceholder(parameter);
  if (parameter.inputType === "textarea") {
    return (
      <textarea
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (parameter.inputType === "select") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {(parameter.required === false || !value) && <option value="">未选择</option>}
        {(parameter.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={parameter.inputType === "email" ? "email" : parameter.inputType === "number" ? "number" : "text"}
      inputMode={parameter.inputType === "email_list" ? "email" : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
