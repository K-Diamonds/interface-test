import { ComponentHealth } from "@cu/contracts";
import { useHealth } from "@/features/system/hooks/useHealth";

/**
 * Catalog-only when execution is unavailable.
 * Hosted Vercel with a healthy Browserbase runtime is live operational UI.
 */
export function useHostedRuntime() {
  const health = useHealth();
  const execution = health.data?.execution;
  const runtime = health.data?.components.browserRuntime;
  const bind = health.data?.bind;
  const executionAvailable = Boolean(
    execution?.discovery &&
      execution.replay &&
      execution.browserRuntime === "available",
  );
  const catalogOnly =
    !executionAvailable &&
    (execution?.browserRuntime === "unavailable" ||
      runtime === ComponentHealth.Unreachable ||
      bind === "hosted");
  return {
    hosted: bind === "hosted",
    catalogOnly,
    executionAvailable,
    execution,
    bind,
    loading: health.isLoading,
    health,
  };
}
