import { useState, useEffect, useCallback } from "react";
import type { TeamPlan, RunDetail } from "../api/team-types";
import { ALL_FIXTURES } from "../fixtures/team-fixtures";
import { ExecutionMap } from "../graph/ExecutionMap";
import { ExecutionTaskDetail } from "../graph/ExecutionTaskDetail";
import "./app.css";

export type DataSource = "mock" | "live";

export function App() {
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(ALL_FIXTURES[0].id);
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFixture = useCallback((fixtureId: string) => {
    const entry = ALL_FIXTURES.find((f) => f.id === fixtureId);
    if (entry) {
      setPlan(entry.plan);
      setRun(entry.run);
      setSelectedTaskId(null);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (dataSource === "mock") {
      loadFixture(selectedFixtureId);
    }
  }, [dataSource, selectedFixtureId, loadFixture]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">Team Console</h1>
          <span className="app-subtitle">Execution map preview</span>
        </div>
        <div className="app-header-right">
          <select
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as DataSource)}
            className="datasource-select"
          >
            <option value="mock">Mock fixture</option>
            <option value="live">Live API</option>
          </select>
        </div>
      </header>

      {dataSource === "mock" && (
        <div className="fixture-bar">
          <span className="fixture-label">Fixture:</span>
          {ALL_FIXTURES.map((f) => (
            <button
              key={f.id}
              className={`fixture-btn ${selectedFixtureId === f.id ? "active" : ""}`}
              onClick={() => setSelectedFixtureId(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <main className="app-main">
        {plan && run ? (
          <div className="workspace">
            <div className="workspace-map">
              <ExecutionMap
                plan={plan}
                run={run}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
              />
            </div>
            {selectedTaskId && (
              <div className="workspace-detail">
                <ExecutionTaskDetail
                  run={run}
                  plan={plan}
                  selectedTaskId={selectedTaskId}
                  onClose={() => setSelectedTaskId(null)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <p>No run selected. Choose a run to view its execution map.</p>
          </div>
        )}
      </main>
    </div>
  );
}
