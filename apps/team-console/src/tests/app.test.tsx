import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../app/App";

describe("App", () => {
  it("renders the title", () => {
    render(<App />);
    expect(screen.getByText("Team Console")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<App />);
    expect(screen.getByText("Execution map preview")).toBeInTheDocument();
  });

  it("renders datasource selector", () => {
    render(<App />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("mock");
  });

  it("renders empty state when no run selected", () => {
    render(<App />);
    expect(screen.getByText(/No run selected/)).toBeInTheDocument();
  });

  it("has mock and live options", () => {
    render(<App />);
    const options = screen.getAllByRole("option");
    const values = options.map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain("mock");
    expect(values).toContain("live");
  });
});
