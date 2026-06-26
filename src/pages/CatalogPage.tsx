import { useCallback, useEffect, useMemo, useState } from "react";
import { hardwareInfo, listModels, type HardwareInfo } from "../api/ollama";
import { ServiceBar } from "../components/ServiceBar";
import type { ServiceStatus } from "../api/ollama";
import { CATALOG, type CatalogModel } from "../catalog";
import { evaluate, summarizeMachine, type RunLevel } from "../utils/recommend";
import type { DownloadsApi } from "../hooks/useDownloads";

interface Props {
  serviceStatus: ServiceStatus | null;
  refreshService: () => void;
  /** 下载状态由 App 持有，跨 tab 切换不丢失 */
  downloads: DownloadsApi;
}

const LEVEL_STYLE: Record<RunLevel, { bg: string; fg: string; dot: string }> = {
  smooth: { bg: "rgba(34,160,90,0.14)", fg: "#1f8a4c", dot: "#22a05a" },
  strained: { bg: "rgba(200,150,20,0.16)", fg: "#9a7407", dot: "#d2a017" },
  unsupported: { bg: "rgba(200,60,60,0.14)", fg: "#b23b3b", dot: "#c84a4a" },
};

const CATEGORIES = ["全部", "对话", "代码", "推理"] as const;

export function CatalogPage({ serviceStatus, refreshService, downloads }: Props) {
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [hideUnsupported, setHideUnsupported] = useState(true);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("全部");
  const [err, setErr] = useState<string | null>(null);

  const refreshInstalled = useCallback(async () => {
    try {
      const m = await listModels();
      setInstalled(m.map((x) => x.name.toLowerCase()));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    hardwareInfo()
      .then(setHw)
      .catch((e) => setErr(String(e)));
    refreshInstalled();
  }, [refreshInstalled]);

  // 下载完成由 useDownloads 的 onComplete 触发 refreshInstalled（见 download()）；
  // 若完成发生在本页未挂载时，则由上面的 mount useEffect 重新拉取，无需重复监听。

  const isInstalled = useCallback(
    (m: CatalogModel) => {
      // 下载完成后模型以干净命名 model.id 存在（带 :latest）
      const id = m.id.toLowerCase();
      return installed.some((n) => n === id || n === `${id}:latest`);
    },
    [installed]
  );

  const rows = useMemo(() => {
    if (!hw) return [];
    return CATALOG.filter((m) => cat === "全部" || m.category === cat)
      .map((m) => ({ m, v: evaluate(m, hw), installed: isInstalled(m) }))
      .filter((r) => !(hideUnsupported && r.v.level === "unsupported" && !r.installed));
  }, [hw, cat, hideUnsupported, isInstalled]);

  function download(m: CatalogModel) {
    setErr(null);
    downloads.start(m, refreshInstalled);
  }

  return (
    <>
      <ServiceBar status={serviceStatus} onChanged={refreshService} />
      <div className="page">
        <h2>模型市场</h2>
        <div className="sub">从国产镜像（ModelScope）一键下载，按本机配置标注能否跑得动</div>

        {/* 本机能力横幅 */}
        <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 26 }}>🖥️</div>
          <div style={{ flex: 1 }}>
            {hw ? (
              <>
                <div style={{ fontWeight: 600 }}>
                  {hw.cpu_brand || "CPU"} · {hw.cpu_physical_cores} 核 {hw.cpu_threads} 线程 ·
                  内存 {Math.round(hw.mem_total / 1024 ** 3)}GB
                </div>
                <div className="sub" style={{ marginTop: 2 }}>
                  {summarizeMachine(hw)}
                </div>
              </>
            ) : (
              <div className="sub">{err ? `读取硬件失败：${err}` : "正在检测本机配置…"}</div>
            )}
          </div>
        </div>

        {/* 工具栏 */}
        <div className="toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`btn sm ${cat === c ? "primary" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
          <span className="grow" />
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={hideUnsupported}
              onChange={(e) => setHideUnsupported(e.target.checked)}
            />
            隐藏本机跑不动的
          </label>
        </div>

        {err && <div className="err">{err}</div>}

        {/* 模型卡片 */}
        {rows.map(({ m, v, installed: ins }) => {
          const st = LEVEL_STYLE[v.level];
          const dl = downloads.map[m.id];
          const downloadingThis = dl?.phase === "running";
          return (
            <div className="card model-card" key={m.id}>
              <div className="icon">◆</div>
              <div className="info">
                <div className="name">
                  {m.name}
                  <span
                    className="chip"
                    style={{
                      background: st.bg,
                      color: st.fg,
                      border: "none",
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: st.dot,
                        marginRight: 5,
                      }}
                    />
                    {v.label}
                    {v.gpu ? "（显卡）" : ""}
                  </span>
                  {ins && <span className="chip run">已安装</span>}
                </div>
                <div className="tags">
                  <span className="chip">{m.params}</span>
                  <span className="chip">{m.quant}</span>
                  <span className="chip">下载约 {m.sizeGB}GB</span>
                  <span className="chip">{m.category}</span>
                  {v.level !== "unsupported" && (
                    <span className="chip">~{v.estTps} tok/s</span>
                  )}
                </div>
                <div className="sub" style={{ marginTop: 4 }}>
                  {m.desc}
                </div>
                <div className="sub" style={{ marginTop: 2, color: st.fg }}>
                  {v.reason}
                </div>
                {dl && (
                  <>
                    {dl.pct !== null && dl.phase === "running" && (
                      <div className="progress" style={{ marginTop: 8 }}>
                        <i style={{ width: `${dl.pct}%` }} />
                      </div>
                    )}
                    <div
                      className="sub"
                      style={{
                        marginTop: 4,
                        color: dl.phase === "error" ? "#b23b3b" : undefined,
                      }}
                    >
                      {dl.status}
                      {dl.pct !== null && dl.phase === "running"
                        ? ` · ${dl.pct}%`
                        : ""}
                      {dl.phase !== "running" && (
                        <button
                          className="btn sm"
                          style={{ marginLeft: 8, padding: "1px 8px" }}
                          onClick={() => downloads.clear(m.id)}
                        >
                          知道了
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="actions">
                {ins ? (
                  <button className="btn sm" disabled>
                    已安装
                  </button>
                ) : v.level === "unsupported" ? (
                  <button
                    className="btn sm danger"
                    disabled
                    title={v.reason}
                  >
                    跑不动
                  </button>
                ) : (
                  <button
                    className="btn sm primary"
                    disabled={downloads.anyActive}
                    onClick={() => {
                      if (
                        v.level === "strained" &&
                        !confirm(
                          `「${m.name}」在本机预计${v.reason}。仍要下载吗？`
                        )
                      )
                        return;
                      download(m);
                    }}
                  >
                    {downloadingThis
                      ? "下载中…"
                      : downloads.anyActive
                      ? "忙碌中"
                      : "下载"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {hw && rows.length === 0 && (
          <div className="empty">该分类下没有本机可运行的模型（可关闭“隐藏跑不动的”查看全部）。</div>
        )}
      </div>
    </>
  );
}
