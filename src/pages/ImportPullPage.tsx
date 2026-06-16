import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createFromGguf,
  listGgufFiles,
  pullModel,
  type GgufFile,
} from "../api/ollama";
import { ServiceBar } from "../components/ServiceBar";
import { formatBytes } from "../utils/format";
import type { ServiceStatus } from "../api/ollama";
import type { StreamEvent } from "../api/transport";

const DEFAULT_GGUF_DIR = "/home/user/models";

interface Props {
  serviceStatus: ServiceStatus | null;
  refreshService: () => void;
  onDone: () => void;
}

export function ImportPullPage({
  serviceStatus,
  refreshService,
  onDone,
}: Props) {
  // 导入态
  const [ggufs, setGgufs] = useState<GgufFile[]>([]);
  const [ggufPath, setGgufPath] = useState("");
  const [name, setName] = useState("");
  const [numCtx, setNumCtx] = useState("");
  const [system, setSystem] = useState("");
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);

  // 拉取态
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string[]>([]);
  const [pullPct, setPullPct] = useState<number | null>(null);

  useEffect(() => {
    listGgufFiles(DEFAULT_GGUF_DIR)
      .then(setGgufs)
      .catch(() => setGgufs([]));
  }, []);

  function pickGguf(f: GgufFile) {
    setGgufPath(f.path);
    if (!name) {
      // 由文件名推断一个默认模型名
      const base = f.name.replace(/\.gguf$/i, "").toLowerCase();
      setName(base.replace(/[^a-z0-9._-]+/g, "-"));
    }
  }

  async function browseGguf() {
    const selected = await open({
      multiple: false,
      defaultPath: DEFAULT_GGUF_DIR,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (typeof selected === "string") {
      setGgufPath(selected);
      const base = selected.split("/").pop()?.replace(/\.gguf$/i, "") ?? "";
      if (!name) setName(base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"));
    }
  }

  async function doImport() {
    if (!ggufPath || !name) return;
    setImporting(true);
    setImportLog([]);
    const params = {
      num_ctx: numCtx ? parseInt(numCtx, 10) : undefined,
      system: system || undefined,
    };
    try {
      await createFromGguf(name, ggufPath, params, (ev: StreamEvent) => {
        if (ev.type === "line")
          setImportLog((l) => [...l, ev.text]);
        else if (ev.type === "data")
          setImportLog((l) => [...l, JSON.stringify(ev.payload)]);
        else if (ev.type === "error")
          setImportLog((l) => [...l, `❌ ${ev.message}`]);
      });
      onDone();
    } catch (e) {
      setImportLog((l) => [...l, `❌ ${String(e)}`]);
    } finally {
      setImporting(false);
    }
  }

  async function doPull() {
    if (!pullName) return;
    setPulling(true);
    setPullLog([]);
    setPullPct(null);
    try {
      await pullModel(pullName, (ev: StreamEvent) => {
        if (ev.type === "data") {
          const p = ev.payload as any;
          if (p.total && p.completed) {
            setPullPct(Math.round((p.completed / p.total) * 100));
          }
          if (p.status) setPullLog((l) => [p.status, ...l].slice(0, 60));
        } else if (ev.type === "line") {
          setPullLog((l) => [ev.text, ...l].slice(0, 60));
        } else if (ev.type === "error") {
          setPullLog((l) => [`❌ ${ev.message}`, ...l]);
        }
      });
      onDone();
    } catch (e) {
      setPullLog((l) => [`❌ ${String(e)}`, ...l]);
    } finally {
      setPulling(false);
      setPullPct(null);
    }
  }

  return (
    <>
      <ServiceBar status={serviceStatus} onChanged={refreshService} />
      <div className="page">
        <h2>导入 / 获取模型</h2>
        <div className="sub">从本地 GGUF 文件导入，或从 ollama 仓库拉取</div>

        {/* 导入 GGUF */}
        <div className="card">
          <div className="section-title">从 GGUF 导入</div>

          {ggufs.length > 0 && (
            <div className="field">
              <label>{DEFAULT_GGUF_DIR} 下的 GGUF 文件（点击选择）</label>
              <div className="tags">
                {ggufs.map((f) => (
                  <span
                    key={f.path}
                    className={`chip ${ggufPath === f.path ? "gold" : ""}`}
                    style={{ cursor: "pointer", padding: "5px 10px" }}
                    onClick={() => pickGguf(f)}
                  >
                    {f.name} · {formatBytes(f.size)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>GGUF 路径</label>
            <div className="row">
              <input
                className="input"
                value={ggufPath}
                placeholder="/path/to/model.gguf"
                onChange={(e) => setGgufPath(e.target.value)}
                style={{ flex: 3 }}
              />
              <button
                className="btn"
                onClick={browseGguf}
                style={{ flex: "0 0 auto" }}
              >
                浏览…
              </button>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>模型名（ollama 中的名称）</label>
              <input
                className="input"
                value={name}
                placeholder="如 qwen2.5-3b"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>上下文长度 num_ctx（可选）</label>
              <input
                className="input"
                value={numCtx}
                placeholder="如 4096"
                onChange={(e) => setNumCtx(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>System Prompt（可选）</label>
            <textarea
              className="textarea"
              value={system}
              placeholder="给模型设定的系统提示…"
              onChange={(e) => setSystem(e.target.value)}
            />
          </div>

          <button
            className="btn primary"
            disabled={importing || !ggufPath || !name}
            onClick={doImport}
          >
            {importing ? "导入中…" : "导入到 ollama"}
          </button>

          {importLog.length > 0 && (
            <pre className="log" style={{ marginTop: 12 }}>
              {importLog.join("\n")}
            </pre>
          )}
        </div>

        {/* 拉取 */}
        <div className="card">
          <div className="section-title">从仓库拉取</div>
          <div className="field">
            <label>模型名</label>
            <div className="row">
              <input
                className="input"
                value={pullName}
                placeholder="如 qwen2.5:3b、llama3.2:1b"
                onChange={(e) => setPullName(e.target.value)}
                style={{ flex: 3 }}
              />
              <button
                className="btn primary"
                disabled={pulling || !pullName}
                onClick={doPull}
                style={{ flex: "0 0 auto" }}
              >
                {pulling ? "拉取中…" : "拉取"}
              </button>
            </div>
          </div>
          {pullPct !== null && (
            <div className="progress">
              <i style={{ width: `${pullPct}%` }} />
            </div>
          )}
          {pullLog.length > 0 && (
            <pre className="log">{pullLog.join("\n")}</pre>
          )}
        </div>
      </div>
    </>
  );
}
