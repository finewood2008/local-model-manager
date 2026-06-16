import { useCallback, useEffect, useState } from "react";
import {
  deleteModel,
  listModels,
  listRunning,
  showModel,
  type OllamaModel,
  type RunningModel,
} from "../api/ollama";
import { ServiceBar } from "../components/ServiceBar";
import { formatBytes, formatRelTime } from "../utils/format";
import type { ServiceStatus } from "../api/ollama";

interface Props {
  serviceStatus: ServiceStatus | null;
  refreshService: () => void;
  onTestModel: (name: string) => void;
}

export function ModelsPage({
  serviceStatus,
  refreshService,
  onTestModel,
}: Props) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [running, setRunning] = useState<RunningModel[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ name: string; data: any } | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [m, r] = await Promise.all([listModels(), listRunning()]);
      setModels(m);
      setRunning(r);
    } catch (e) {
      setErr(String(e));
      setModels([]);
      setRunning([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const runningSet = new Map(running.map((r) => [r.name, r]));

  async function onDelete(name: string) {
    if (!confirm(`确认删除模型「${name}」？此操作不可恢复。`)) return;
    try {
      await deleteModel(name);
      refresh();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function onDetail(name: string) {
    try {
      const data = await showModel(name);
      setDetail({ name, data });
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <>
      <ServiceBar status={serviceStatus} onChanged={refreshService} />
      <div className="page">
        <h2>本地模型</h2>
        <div className="sub">
          已安装 {models.length} 个，运行中 {running.length} 个
        </div>

        <div className="toolbar">
          <span className="grow" />
          <button className="btn sm" onClick={refresh}>
            ⟳ 刷新
          </button>
        </div>

        {err && <div className="err">{err}</div>}

        {models.length === 0 && !err && (
          <div className="empty">
            还没有任何模型。去「导入 / 获取」页从 GGUF 导入，或拉取一个模型。
          </div>
        )}

        {models.map((m) => {
          const run = runningSet.get(m.name);
          return (
            <div className="card model-card" key={m.name}>
              <div className="icon">◆</div>
              <div className="info">
                <div className="name">
                  {m.name}
                  {run && <span className="chip run">运行中</span>}
                </div>
                <div className="tags">
                  <span className="chip">{formatBytes(m.size)}</span>
                  {m.details?.parameter_size && (
                    <span className="chip">{m.details.parameter_size}</span>
                  )}
                  {m.details?.quantization_level && (
                    <span className="chip">{m.details.quantization_level}</span>
                  )}
                  {m.details?.family && (
                    <span className="chip">{m.details.family}</span>
                  )}
                  {run?.size_vram ? (
                    <span className="chip gold">
                      占用 {formatBytes(run.size)}
                    </span>
                  ) : run ? (
                    <span className="chip gold">内存 {formatBytes(run.size)}</span>
                  ) : null}
                  {m.modified_at && (
                    <span className="chip">{formatRelTime(m.modified_at)}</span>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn sm primary"
                  onClick={() => onTestModel(m.name)}
                >
                  对话测试
                </button>
                <button className="btn sm" onClick={() => onDetail(m.name)}>
                  详情
                </button>
                <button
                  className="btn sm danger"
                  onClick={() => onDelete(m.name)}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}

        {detail && (
          <div className="card">
            <div className="toolbar">
              <div className="section-title">{detail.name} · 详情</div>
              <span className="grow" />
              <button className="btn sm" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
            {detail.data?.parameters && (
              <>
                <div className="section-title">参数</div>
                <pre className="log">{detail.data.parameters}</pre>
              </>
            )}
            {detail.data?.modelfile && (
              <>
                <div className="section-title" style={{ marginTop: 12 }}>
                  Modelfile
                </div>
                <pre className="log">{detail.data.modelfile}</pre>
              </>
            )}
            {detail.data?.template && (
              <>
                <div className="section-title" style={{ marginTop: 12 }}>
                  Template
                </div>
                <pre className="log">{detail.data.template}</pre>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
