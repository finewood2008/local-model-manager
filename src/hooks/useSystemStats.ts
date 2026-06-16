import { useEffect, useState } from "react";
import { systemStats, type SystemStats } from "../api/ollama";

export function useSystemStats(intervalMs = 2000, enabled = true) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await systemStats();
        if (alive) setStats(s);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs, enabled]);

  return stats;
}
