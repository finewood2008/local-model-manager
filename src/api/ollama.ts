// 框架无关的 ollama 领域客户端。仅依赖 Transport 抽象。
import type { StreamEvent, Transport } from "./transport";
import { tauriTransport } from "./transport.tauri";

// 当前传输实现（嵌入时替换这一行即可）
const t: Transport = tauriTransport;

// ---------- 类型 ----------
export interface ModelDetails {
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
  format?: string;
}
export interface OllamaModel {
  name: string;
  model?: string;
  size: number;
  modified_at?: string;
  details?: ModelDetails;
}
export interface RunningModel {
  name: string;
  model?: string;
  size: number;
  size_vram?: number;
  expires_at?: string;
}
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ServiceStatus {
  running: boolean;
  pid: number | null;
  version: string | null;
}
export interface SystemStats {
  cpu_usage: number;
  cpu_count: number;
  mem_total: number;
  mem_used: number;
  mem_available: number;
}
export interface GgufFile {
  path: string;
  name: string;
  size: number;
}
export interface ImportParams {
  num_ctx?: number;
  system?: string;
  temperature?: number;
}

// ---------- 非流式 ----------
export async function getVersion(): Promise<{ version: string }> {
  return t.invoke("ollama_version");
}
export async function listModels(): Promise<OllamaModel[]> {
  const res = await t.invoke<{ models: OllamaModel[] }>("ollama_list");
  return res?.models ?? [];
}
export async function listRunning(): Promise<RunningModel[]> {
  const res = await t.invoke<{ models: RunningModel[] }>("ollama_ps");
  return res?.models ?? [];
}
export async function showModel(name: string): Promise<any> {
  return t.invoke("ollama_show", { name });
}
export async function deleteModel(name: string): Promise<void> {
  return t.invoke("ollama_delete", { name });
}

// ---------- 服务 / 系统 / 文件 ----------
export async function serviceStatus(): Promise<ServiceStatus> {
  return t.invoke("service_status");
}
export async function serviceStart(): Promise<void> {
  return t.invoke("service_start");
}
export async function serviceStop(): Promise<void> {
  return t.invoke("service_stop");
}
export async function systemStats(): Promise<SystemStats> {
  return t.invoke("system_stats");
}
export async function listGgufFiles(dir: string): Promise<GgufFile[]> {
  return t.invoke("list_gguf_files", { dir });
}

// ---------- 流式 ----------
export function pullModel(
  name: string,
  onEvent: (ev: StreamEvent) => void
): Promise<void> {
  return t.stream("ollama_pull", { name }, onEvent);
}

export function chat(
  model: string,
  messages: ChatMessage[],
  options: Record<string, unknown> | undefined,
  onEvent: (ev: StreamEvent) => void
): Promise<void> {
  return t.stream("ollama_chat", { model, messages, options }, onEvent);
}

/** 停止当前对话生成 */
export async function stopChat(): Promise<void> {
  return t.invoke("ollama_stop_chat");
}

export function createFromGguf(
  name: string,
  ggufPath: string,
  params: ImportParams | undefined,
  onEvent: (ev: StreamEvent) => void
): Promise<void> {
  return t.stream(
    "ollama_create_from_gguf",
    { name, ggufPath, params },
    onEvent
  );
}
