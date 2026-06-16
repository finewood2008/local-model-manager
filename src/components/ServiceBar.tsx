import { useState } from "react";
import { serviceStart, serviceStop } from "../api/ollama";
import type { ServiceStatus } from "../api/ollama";

interface Props {
  status: ServiceStatus | null;
  onChanged: () => void;
}

export function ServiceBar({ status, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const running = status?.running ?? false;

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      if (running) {
        await serviceStop();
      } else {
        await serviceStart();
      }
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="service-bar">
      <span className={`status-led ${running ? "on" : "off"}`} />
      <span className="meta">
        Ollama 服务：<b>{running ? "运行中" : "已停止"}</b>
        {status?.version && <>　·　版本 {status.version}</>}
        {status?.pid && <>　·　PID {status.pid}</>}
      </span>
      <span className="grow" />
      {err && <span className="err">{err}</span>}
      <button
        className={`btn sm ${running ? "danger" : "primary"}`}
        disabled={busy}
        onClick={toggle}
      >
        {busy ? "处理中…" : running ? "停止服务" : "启动服务"}
      </button>
    </div>
  );
}
