// 传输抽象层 —— 领域逻辑（ollama.ts）只依赖此接口，不直接依赖 Tauri。
// 日后嵌入 CentaurAI(Electron) 时，只需提供一个 transport.electron.ts 走其 IPC 即可复用全部上层代码。

/** 与 Rust 端 StreamEvent 枚举一一对应（serde tag = "type", snake_case） */
export type StreamEvent =
  | { type: "data"; payload: any }
  | { type: "line"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface Transport {
  /** 一次性调用，返回结果 */
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  /** 流式调用，分片通过 onEvent 回调推送，promise 在底层调用返回时 resolve */
  stream(
    cmd: string,
    args: Record<string, unknown>,
    onEvent: (ev: StreamEvent) => void
  ): Promise<void>;
}
