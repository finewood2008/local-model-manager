// Tauri 实现：invoke + Channel 事件。
import { invoke, Channel } from "@tauri-apps/api/core";
import type { Transport, StreamEvent } from "./transport";

export const tauriTransport: Transport = {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(cmd, args);
  },

  async stream(
    cmd: string,
    args: Record<string, unknown>,
    onEvent: (ev: StreamEvent) => void
  ): Promise<void> {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = (msg) => onEvent(msg);
    // Rust 端流式 command 的 Channel 参数名为 on_event → JS 侧 camelCase onEvent
    await invoke(cmd, { ...args, onEvent: channel });
  },
};
