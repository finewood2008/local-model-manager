import { useCallback, useEffect, useState } from "react";
import { serviceStatus, type ServiceStatus } from "../api/ollama";

export function useServiceStatus(intervalMs = 3000) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await serviceStatus();
      setStatus(s);
    } catch {
      setStatus({ running: false, pid: null, version: null });
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { status, loading, setLoading, refresh };
}
