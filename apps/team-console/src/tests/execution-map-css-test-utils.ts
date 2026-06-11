import { readFileSync } from "node:fs";

export const readExecutionMapCss = (): string => {
  const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
  const rootDockCss = readFileSync("src/graph/execution-map-root-dock.css", "utf8");
  const runObserverCss = readFileSync("src/graph/execution-map-run-observer.css", "utf8");
  const evidencePreviewCss = readFileSync("src/graph/execution-map-evidence-preview.css", "utf8");

  return mapCss
    .replace('@import "./execution-map-root-dock.css";', rootDockCss.trimEnd())
    .replace('@import "./execution-map-run-observer.css";', runObserverCss.trimEnd())
    .replace('@import "./execution-map-evidence-preview.css";', evidencePreviewCss.trimEnd());
};
