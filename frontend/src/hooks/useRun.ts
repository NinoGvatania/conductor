import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface RunState {
  run_id: string;
  workflow_id: string;
  status: string;
  steps: Array<Record<string, unknown>>;
  total_tokens: number;
  total_cost_usd: number;
  total_steps: number;
}

export function useRun(runId: string, pollInterval = 3000) {
  const [run, setRun] = useState<RunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchRun() {
      try {
        const data = (await api.getRun(runId)) as RunState;
        if (active) {
          setRun(data);
          setLoading(false);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Failed to load run");
          setLoading(false);
        }
      }
    }

    fetchRun();

    const interval = setInterval(() => {
      if (run?.status === "running") {
        fetchRun();
      }
    }, pollInterval);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId, pollInterval, run?.status]);

  return { run, loading, error };
}
