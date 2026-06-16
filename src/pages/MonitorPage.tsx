import { useEffect, useState } from "react";
import { listRunning, type RunningModel } from "../api/ollama";
import { ServiceBar } from "../components/ServiceBar";
import { Gauge } from "../components/Gauge";
import { useSystemStats } from "../hooks/useSystemStats";
import { formatBytes, formatRelTime } from "../utils/format";
import type { ServiceStatus } from "../api/ollama";

interface Props {
  serviceStatus: ServiceStatus | null;
  refreshService: () => void;
  active: boolean;
}

export function MonitorPage({ serviceStatus, refreshService, active }: Props) {
  const stats = useSystemStats(2000, active);
  const [running, setRunning] = useState<RunningModel[]>([]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = () =>
      listRunning()
        .then((r) => alive && setRunning(r))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active]);

  const memPct = stats
    ? Math.round((stats.mem_used / stats.mem_total) * 100)
    : 0;

  return (
    <>
      <ServiceBar status={serviceStatus} onChanged={refreshService} />
      <div className="page">
        <h2>资源监控</h2>
        <div className="sub">本机为纯 CPU 推理，实时刷新</div>

        <div className="gauges">
          <Gauge
            label="CPU 使用率"
            value={stats ? `${stats.cpu_usage.toFixed(0)}%` : "—"}
            sub={stats ? `${stats.cpu_count} 核` : ""}
            percent={stats?.cpu_usage}
          />
          <Gauge
            label="内存使用"
            value={stats ? formatBytes(stats.mem_used) : "—"}
            sub={stats ? `/ ${formatBytes(stats.mem_total)}` : ""}
            percent={memPct}
          />
          <Gauge
            label="可用内存"
            value={stats ? formatBytes(stats.mem_available) : "—"}
          />
          <Gauge label="运行中模型" value={`${running.length}`} sub="个" />
        </div>

        <div className="divider" />

        <div className="section-title">运行中的模型（已载入内存）</div>
        {running.length === 0 ? (
          <div className="empty">
            当前没有模型载入内存。在「对话」页发一条消息会触发载入。
          </div>
        ) : (
          running.map((r) => (
            <div className="card model-card" key={r.name}>
              <div className="icon">▶</div>
              <div className="info">
                <div className="name">{r.name}</div>
                <div className="tags">
                  <span className="chip gold">占用 {formatBytes(r.size)}</span>
                  {r.size_vram ? (
                    <span className="chip">显存 {formatBytes(r.size_vram)}</span>
                  ) : (
                    <span className="chip">CPU 内存</span>
                  )}
                  {r.expires_at && (
                    <span className="chip">
                      到期 {formatRelTime(r.expires_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
