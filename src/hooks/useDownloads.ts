// 下载管理器：状态挂在 App 顶层，跨 tab 切换不丢失。
// 背景：页面用条件渲染，切走会卸载组件。若把下载进度放页面内部 state，
// 切 tab 即丢失（后台 ollama 拉取其实仍在继续，丢的只是 UI 进度）。
//
// 两段式下载（关键）：ModelScope 拉来的 GGUF 是空模板 {{ .Prompt }}，直接用会“自问自答”。
// 所以：① 下载 GGUF（大） → ② 套上该模型族的正确对话模板，另存为干净命名 → ③ 删除空模板原始引用
// （blob 共享，权重保留）。最终得到一个名为 model.id、模板正确、可直接对话的模型。

import { useCallback, useRef, useState } from "react";
import { applyTemplate, deleteModel, pullModel } from "../api/ollama";
import type { StreamEvent } from "../api/transport";
import type { CatalogModel } from "../catalog";
import { getChatTemplate } from "../templates";

export interface DownloadState {
  /** 0-100；null 表示尚未拿到总量（解析 manifest / 套模板阶段） */
  pct: number | null;
  status: string;
  phase: "running" | "done" | "error";
}

export interface DownloadsApi {
  /** key = model.id */
  map: Record<string, DownloadState>;
  anyActive: boolean;
  /** 发起下载（含套模板）；onComplete 在成功后触发 */
  start: (model: CatalogModel, onComplete?: () => void) => void;
  clear: (id: string) => void;
}

export function useDownloads(): DownloadsApi {
  const [map, setMap] = useState<Record<string, DownloadState>>({});
  const activeRef = useRef<Set<string>>(new Set());

  const set = useCallback((id: string, s: DownloadState) => {
    setMap((m) => ({ ...m, [id]: s }));
  }, []);

  const start = useCallback(
    (model: CatalogModel, onComplete?: () => void) => {
      const id = model.id;
      // 单线下载：已在下或已有别的下载进行中则忽略（与 UI 的 anyActive 一致，双重保险）。
      if (activeRef.current.has(id) || activeRef.current.size > 0) return;
      activeRef.current.add(id);
      set(id, { pct: null, status: "准备下载…", phase: "running" });

      let failed = false;
      const markFailed = (msg: string) => {
        failed = true;
        set(id, { pct: null, status: `❌ 下载失败：${msg}`, phase: "error" });
      };

      // 阶段 1：从 ModelScope 下载 GGUF
      pullModel(model.pull, (ev: StreamEvent) => {
        if (ev.type === "data") {
          const p = ev.payload as any;
          // ollama 在 200 流里也可能用 {"error":...} 表达失败
          if (p.error) {
            markFailed(String(p.error));
            return;
          }
          const pct =
            p.total && p.completed
              ? Math.round((p.completed / p.total) * 100)
              : null;
          set(id, { pct, status: `下载中 · ${p.status || ""}`, phase: "running" });
        } else if (ev.type === "line") {
          set(id, { pct: null, status: ev.text, phase: "running" });
        } else if (ev.type === "error") {
          markFailed(ev.message);
        }
      })
        .then(() => {
          if (failed) throw new Error("download failed");
          // 阶段 2：套上正确对话模板（复用权重，秒级）
          set(id, {
            pct: 100,
            status: "下载完成，正在套对话模板…",
            phase: "running",
          });
          const tmpl = getChatTemplate(model.chatTemplate);
          return applyTemplate(
            model.pull,
            id,
            tmpl.template,
            tmpl.stop,
            (ev: StreamEvent) => {
              if (ev.type === "error") {
                failed = true;
                set(id, {
                  pct: 100,
                  status: `❌ 套模板失败：${ev.message}`,
                  phase: "error",
                });
              }
            }
          );
        })
        .then(() => {
          if (failed) throw new Error("apply template failed");
          // 阶段 3：删除空模板的原始引用（blob 共享，权重不丢）
          return deleteModel(model.pull).catch(() => {});
        })
        .then(() => {
          setMap((m) => {
            const cur = m[id];
            if (cur?.phase === "error") return m;
            return { ...m, [id]: { pct: 100, status: "✅ 已就绪，可对话", phase: "done" } };
          });
          onComplete?.();
        })
        .catch((e) => {
          if (!failed) {
            set(id, { pct: null, status: `❌ ${String(e)}`, phase: "error" });
          }
        })
        .finally(() => {
          activeRef.current.delete(id);
        });
    },
    [set]
  );

  const clear = useCallback((id: string) => {
    // 同时从 activeRef 移除，避免 anyActive 卡死、条目“复活”。
    activeRef.current.delete(id);
    setMap((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }, []);

  const anyActive = Object.values(map).some((s) => s.phase === "running");
  return { map, anyActive, start, clear };
}
