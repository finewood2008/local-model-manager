// 运行能力评估引擎：结合本机硬件画像，判断每个模型“流畅 / 吃力 / 跑不动”。
// 设计原则：内存是硬门槛（装不下就跑不动），CPU/显卡决定速度档位。

import type { HardwareInfo } from "../api/ollama";
import type { CatalogModel } from "../catalog";

export type RunLevel = "smooth" | "strained" | "unsupported";

export interface Verdict {
  level: RunLevel;
  /** 中文标签 */
  label: string;
  /** 一句话原因 */
  reason: string;
  /** 估算生成速度 tok/s */
  estTps: number;
  /** 运行所需内存(GB，估) */
  needGB: number;
  /** 是否走独显加速 */
  gpu: boolean;
}

const GB = 1024 ** 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// 标称内存与 OS 上报值的差额（固件/核显预留），用于边界判定容差。
const MEM_TOL = 0.6;

export function evaluate(model: CatalogModel, hw: HardwareInfo): Verdict {
  const memTotalGB = hw.mem_total / GB;
  const memAvailGB = hw.mem_available / GB;
  const bestVramGB = hw.gpus.reduce((m, g) => Math.max(m, g.vram_total / GB), 0);
  const hasGpu = bestVramGB >= 2;
  const needGB = model.minRamGB; // CPU/系统内存运行下限
  // 显存占用 ≈ 权重(sizeGB) + KV/上下文余量。注意不能用 minRam/recRam（那是系统内存口径，约 2× 权重）。
  const vramNeedGB = model.sizeGB * 1.2;

  // 速度估算：CPU 主要受内存带宽限制 ~ 45/参数量，再按线程数相对 12 线程缩放。
  let estTps = clamp((45 / model.paramsB) * (hw.cpu_threads / 12), 0.5, 60);
  const gpuFullFit = hasGpu && bestVramGB + MEM_TOL >= vramNeedGB;
  if (gpuFullFit) estTps *= 4; // 独显能全量装下 → 大幅加速

  // 1) 独显能全量容纳模型权重 → 流畅（GPU）
  if (gpuFullFit) {
    return {
      level: "smooth",
      label: "流畅",
      reason: `独显约 ${Math.round(bestVramGB)}GB 可全量加速`,
      estTps: Math.round(estTps),
      needGB: Math.ceil(vramNeedGB),
      gpu: true,
    };
  }
  // 2) 独显能装下一半以上 + 系统内存可兜底溢出 → 吃力（部分 GPU offload）
  if (hasGpu && bestVramGB >= vramNeedGB * 0.5 && memTotalGB + MEM_TOL >= needGB) {
    return {
      level: "strained",
      label: "吃力",
      reason: `显存约 ${Math.round(bestVramGB)}GB 仅部分容纳，需 CPU 兜底，速度一般`,
      estTps: Math.round(Math.max(estTps, estTps * 2)),
      needGB: Math.ceil(vramNeedGB),
      gpu: true,
    };
  }

  // ---- CPU 路径（无独显或显存不足）----
  // 3) 内存装不下 → 跑不动，不建议下载（带容差，避免 15.7≈16 被误判）
  if (memTotalGB + MEM_TOL < needGB) {
    return {
      level: "unsupported",
      label: "跑不动",
      reason: `需约 ${needGB}GB 内存，本机仅 ${memTotalGB.toFixed(0)}GB，不建议下载`,
      estTps: 0,
      needGB,
      gpu: false,
    };
  }

  const memTight = memTotalGB + MEM_TOL < model.recRamGB || memAvailGB + MEM_TOL < needGB;

  // 4) 内存够 + CPU 够快 → 流畅
  if (estTps >= 8 && !memTight) {
    return {
      level: "smooth",
      label: "流畅",
      reason: `内存充足，CPU 推理流畅（约 ${Math.round(estTps)} tok/s）`,
      estTps: Math.round(estTps),
      needGB,
      gpu: false,
    };
  }
  // 5) 能跑但偏慢 → 吃力
  if (estTps >= 2) {
    return {
      level: "strained",
      label: "吃力",
      reason: memTight
        ? `内存偏紧，需关闭其他程序；速度约 ${Math.round(estTps)} tok/s`
        : `能跑但偏慢（约 ${Math.round(estTps)} tok/s），适合非实时任务`,
      estTps: Math.round(estTps),
      needGB,
      gpu: false,
    };
  }
  // 6) 内存够但 CPU 非常吃力 → 仍归吃力（可离线批处理）
  return {
    level: "strained",
    label: "吃力",
    reason: `内存够但纯 CPU 很慢（约 ${estTps.toFixed(1)} tok/s），仅适合离线批量任务`,
    estTps: Math.max(0.5, +estTps.toFixed(1)),
    needGB,
    gpu: false,
  };
}

/** 给整机一个“最高建议档位”的概述，用于页面顶部横幅。 */
export function summarizeMachine(hw: HardwareInfo): string {
  const memGB = Math.round(hw.mem_total / GB);
  const bestVramGB = hw.gpus.reduce((m, g) => Math.max(m, g.vram_total / GB), 0);
  if (bestVramGB >= 2) {
    const g = hw.gpus[0];
    return `检测到独显 ${g.name}（约 ${Math.round(bestVramGB)}GB 显存），可加速运行较大模型。`;
  }
  // CPU-only：内存定上限、线程定速度档（与逐模型 evaluate 的判定保持一致）。
  const strong = hw.cpu_threads >= 12;
  let tier: string;
  if (memGB >= 44) tier = strong ? "可流畅 14B、吃力 32B" : "可流畅 7B、吃力 14B/32B";
  else if (memGB >= 28) tier = strong ? "可流畅 7B、吃力 14B/32B" : "可流畅 3B、吃力 7B/14B";
  else if (memGB >= 15) tier = strong ? "可流畅 3B/7B、吃力 14B" : "可流畅 3B、吃力 7B";
  else if (memGB >= 7) tier = "建议 3B 及以下";
  else tier = "建议 1.5B 及以下";
  return `无独立显卡（CPU 推理）· 内存 ${memGB}GB / ${hw.cpu_threads} 线程 → ${tier}。`;
}
