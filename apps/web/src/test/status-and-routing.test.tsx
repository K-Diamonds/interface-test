import { ExecutionResultStatus } from "@cu/contracts";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ControllerBadge } from "@/components/domain/ControllerBadge";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { Sidebar } from "@/components/layout/Sidebar";

describe("status badges", () => {
  it("renders run success status", () => {
    render(<RunStatusBadge status={ExecutionResultStatus.Success} />);
    expect(screen.getByText("success")).toBeInTheDocument();
  });

  it("renders human controller", () => {
    render(<ControllerBadge controller="human" />);
    expect(screen.getByText("human")).toBeInTheDocument();
  });
});

describe("hosted chrome", () => {
  it("labels the shell as a catalog, not an execution platform", () => {
    render(
      <MemoryRouter>
        <Sidebar hosted />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Catalog").length).toBeGreaterThan(0);
    expect(screen.queryByText("Hosted Evidence Mode")).not.toBeInTheDocument();
    expect(screen.getByText("Discovery evidence")).toBeInTheDocument();
    expect(screen.getByText("Agent catalog")).toBeInTheDocument();
    expect(screen.getByText("Handoffs")).toBeInTheDocument();
    expect(screen.queryByText("Agent Execution Platform")).not.toBeInTheDocument();
    expect(screen.queryByText("Discovery")).not.toBeInTheDocument();
  });
});

describe("routing", () => {
  it("matches intervention detail route param", () => {
    function Probe() {
      return (
        <Routes>
          <Route
            path="/interventions/:id"
            element={<div>intervention-page</div>}
          />
        </Routes>
      );
    }
    render(
      <MemoryRouter initialEntries={["/interventions/int_abc"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByText("intervention-page")).toBeInTheDocument();
  });
});
