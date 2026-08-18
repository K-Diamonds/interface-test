import { EvidenceKind, ExecutionResultStatus, JobAcceptanceStatus } from "@cu/contracts";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import RunsPage from "@/features/runs/pages/RunsPage";
import DiscoveryPage from "@/features/discovery/pages/DiscoveryPage";
import AgentCatalogPage from "@/features/capabilities/pages/AgentCatalogPage";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(ui: ReactElement, path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/discovery" element={ui} />
          <Route path="/agent" element={ui} />
          <Route path="/discovery/:runId" element={<div data-testid="live">live</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MSW API states", () => {
  it("renders runs success data", async () => {
    server.use(
      http.get("/api/runs", () =>
        HttpResponse.json({
          items: [
            {
              id: "run_success",
              runId: "run_success",
              kind: EvidenceKind.Replay,
              path: "evidence/replay/canonical-success",
              mtime: new Date().toISOString(),
              hasResult: true,
              hasEvents: true,
              hasIntervention: false,
              status: ExecutionResultStatus.Success,
            },
          ],
        }),
      ),
    );
    wrap(<RunsPage />);
    await waitFor(() => {
      expect(screen.getByText("run_success")).toBeInTheDocument();
    });
  });

  it("renders empty runs state", async () => {
    server.use(http.get("/api/runs", () => HttpResponse.json({ items: [] })));
    wrap(<RunsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No runs indexed/i)).toBeInTheDocument();
    });
  });

  it("renders runs error state with retry", async () => {
    server.use(
      http.get("/api/runs", () =>
        HttpResponse.json(
          { error: { code: "DOWN", message: "boom", requestId: "req_1" } },
          { status: 500 },
        ),
      ),
    );
    wrap(<RunsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load runs/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });
  });
});

describe("Discovery form", () => {
  it("disables discovery start when execution is unavailable", async () => {
    server.use(
      http.get("/api/runs", () => HttpResponse.json({ items: [] })),
      http.get("/api/health", () =>
        HttpResponse.json({
          status: "ok",
          bind: "hosted",
          liveInterventions: 0,
          execution: {
            browserRuntime: "unavailable",
            discovery: false,
            replay: false,
            humanControl: false,
          },
          components: {
            capabilityStore: "operational",
            evidenceStore: "operational",
            browserRuntime: "unreachable",
            model: "configured",
          },
          provider: {
            id: "gemini",
            model: "gemini-flash-latest",
            configured: true,
          },
        }),
      ),
      http.get("/api/agent/capabilities", () =>
        HttpResponse.json({
          items: [
            {
              id: "cart.add-product",
              version: 2,
              name: "Add Product to Cart",
              description: "Add a product to the cart",
              status: "approved",
              invocable: true,
              inputs: [
                {
                  name: "productName",
                  type: "string",
                  required: true,
                  description: "Visible product name",
                },
              ],
              outputs: [
                { name: "inCart", type: "boolean", description: "in cart" },
              ],
            },
          ],
        }),
      ),
    );
    wrap(<DiscoveryPage />, "/discovery");
    await waitFor(() => {
      expect(screen.getByText("Discovery evidence")).toBeInTheDocument();
    });
    expect(screen.queryByText("Hosted Evidence Mode")).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini is already configured/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/key present/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Discovery/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Goal$/i)).not.toBeInTheDocument();
  });

  it("submits discovery and navigates to live run", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/runs", () => HttpResponse.json({ items: [] })),
      http.get("/api/health", () =>
        HttpResponse.json({
          status: "ok",
          bind: "127.0.0.1",
          liveInterventions: 0,
          execution: {
            browserRuntime: "available",
            discovery: true,
            replay: true,
            humanControl: true,
          },
          components: {
            capabilityStore: "operational",
            evidenceStore: "operational",
            browserRuntime: "operational",
            model: "configured",
          },
        }),
      ),
      http.post("/api/discovery", () =>
        HttpResponse.json(
          { runId: "run_new_discovery", status: JobAcceptanceStatus.Accepted },
          { status: 202 },
        ),
      ),
    );
    wrap(<DiscoveryPage />, "/discovery");
    await waitFor(() => {
      expect(screen.getByLabelText(/^Goal$/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Start discovery$/i }));
    await waitFor(() => {
      expect(screen.getByTestId("live")).toBeInTheDocument();
    });
  });
});

describe("Agent catalog", () => {
  it("renders live descriptors from GET /api/agent/capabilities", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({
          status: "ok",
          bind: "hosted",
          liveInterventions: 0,
          execution: {
            browserRuntime: "unavailable",
            discovery: false,
            replay: false,
            humanControl: false,
          },
          components: {
            capabilityStore: "operational",
            evidenceStore: "operational",
            browserRuntime: "unreachable",
            model: "configured",
          },
          provider: {
            id: "gemini",
            model: "gemini-flash-latest",
            configured: true,
          },
        }),
      ),
      http.get("/api/agent/capabilities", () =>
        HttpResponse.json({
          items: [
            {
              id: "cart.add-product",
              version: 2,
              name: "Add Product to Cart",
              description: "Add a product to the cart",
              status: "approved",
              invocable: true,
              inputs: [
                {
                  name: "productName",
                  type: "string",
                  required: true,
                  description: "Visible product name",
                },
              ],
              outputs: [
                { name: "inCart", type: "boolean", description: "in cart" },
              ],
            },
          ],
        }),
      ),
    );
    wrap(<AgentCatalogPage />, "/agent");
    await waitFor(() => {
      expect(screen.getByText("Add Product to Cart")).toBeInTheDocument();
    });
    expect(screen.getByText("cart.add-product@v2")).toBeInTheDocument();
    expect(screen.queryByText("Hosted Evidence Mode")).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invoke" })).not.toBeInTheDocument();
  });

  it("shows Invoke when hosted execution is available", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({
          status: "ok",
          bind: "hosted",
          liveInterventions: 0,
          execution: {
            browserRuntime: "available",
            discovery: true,
            replay: true,
            humanControl: true,
          },
          components: {
            capabilityStore: "operational",
            evidenceStore: "operational",
            browserRuntime: "operational",
            browserProvider: "browserbase",
            model: "operational",
          },
        }),
      ),
      http.get("/api/agent/capabilities", () =>
        HttpResponse.json({
          items: [
            {
              id: "cart.add-product",
              version: 2,
              name: "Add Product to Cart",
              description: "Add a product to the cart",
              status: "approved",
              invocable: true,
              inputs: [
                {
                  name: "productName",
                  type: "string",
                  required: true,
                  description: "Visible product name",
                },
              ],
              outputs: [
                { name: "inCart", type: "boolean", description: "in cart" },
              ],
            },
          ],
        }),
      ),
    );
    wrap(<AgentCatalogPage />, "/agent");
    await waitFor(() => {
      expect(screen.getByText("Invocable")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Invoke" })).toBeInTheDocument();
  });
});
