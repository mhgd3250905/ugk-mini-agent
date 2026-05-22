import { useState } from "react";
import "./app.css";

export type DataSource = "mock" | "live";

export function App() {
  const [dataSource, setDataSource] = useState<DataSource>("mock");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">Team Console</h1>
          <span className="app-subtitle">Execution map preview</span>
        </div>
        <div className="app-header-right">
          <label className="datasource-toggle">
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as DataSource)}
              className="datasource-select"
            >
              <option value="mock">Mock fixture</option>
              <option value="live">Live API</option>
            </select>
          </label>
        </div>
      </header>
      <main className="app-main">
        <div className="empty-state">
          <p>No run selected. Choose a run to view its execution map.</p>
        </div>
      </main>
    </div>
  );
}
