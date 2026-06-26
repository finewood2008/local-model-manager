// 精选模型目录。pull 字段均走 ModelScope 国产镜像（已逐个验证 manifest 可解析）。
//
// 重要：从 ModelScope/HF 拉取的 GGUF，ollama 不会自动套 chat 模板（拿到的是空模板
// {{ .Prompt }}，会导致“自问自答 / 答非所问”）。因此下载后必须按 chatTemplate 字段
// 套上正确模板再用（见 useDownloads 的两段式流程）。各档 size/RAM 按 Q4_K_M 估算(GB)。

export type ChatTemplateKey = "chatml" | "llama3" | "gemma";

export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  params: string;
  paramsB: number;
  quant: string;
  sizeGB: number;
  minRamGB: number;
  recRamGB: number;
  pull: string;
  category: "对话" | "代码" | "推理";
  /** 下载后要套的对话模板族 */
  chatTemplate: ChatTemplateKey;
  desc: string;
}

export const CATALOG: CatalogModel[] = [
  // ---------------- 通用对话：Qwen2.5（ChatML）----------------
  { id: "qwen2.5-0.5b", name: "Qwen2.5 0.5B 指令版", family: "Qwen2.5", params: "0.5B", paramsB: 0.5, quant: "Q4_K_M", sizeGB: 0.5, minRamGB: 2, recRamGB: 4, pull: "modelscope.cn/Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "极轻量，老旧机器/树莓派也能跑；适合简单分类、改写、关键词抽取。" },
  { id: "qwen2.5-1.5b", name: "Qwen2.5 1.5B 指令版", family: "Qwen2.5", params: "1.5B", paramsB: 1.5, quant: "Q4_K_M", sizeGB: 1.1, minRamGB: 3, recRamGB: 6, pull: "modelscope.cn/Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "轻量级日常助手，反应快；适合客服话术、短文生成。" },
  { id: "qwen2.5-3b", name: "Qwen2.5 3B 指令版", family: "Qwen2.5", params: "3B", paramsB: 3, quant: "Q4_K_M", sizeGB: 2.0, minRamGB: 5, recRamGB: 8, pull: "modelscope.cn/Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "中小企业本地助手的甜点档，速度与质量平衡，普通办公本即可流畅。" },
  { id: "qwen2.5-7b", name: "Qwen2.5 7B 指令版", family: "Qwen2.5", params: "7B", paramsB: 7, quant: "Q4_K_M", sizeGB: 4.7, minRamGB: 8, recRamGB: 16, pull: "modelscope.cn/Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "明显更聪明，能处理较复杂的总结/问答/写作；建议 16GB 内存或有独显。" },
  { id: "qwen2.5-14b", name: "Qwen2.5 14B 指令版", family: "Qwen2.5", params: "14B", paramsB: 14, quant: "Q4_K_M", sizeGB: 9.0, minRamGB: 14, recRamGB: 24, pull: "modelscope.cn/Qwen/Qwen2.5-14B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "接近商用水准的本地大模型，纯 CPU 偏慢，建议大内存或独显。" },
  { id: "qwen2.5-32b", name: "Qwen2.5 32B 指令版", family: "Qwen2.5", params: "32B", paramsB: 32, quant: "Q4_K_M", sizeGB: 20, minRamGB: 26, recRamGB: 48, pull: "modelscope.cn/Qwen/Qwen2.5-32B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "本地高质量档位，非常吃内存/显存；纯 CPU 仅适合离线批处理。" },

  // ---------------- 通用对话：其他主流（Yi/InternLM=ChatML, Llama=Llama3, Gemma=Gemma）----------------
  { id: "yi1.5-9b", name: "Yi-1.5 9B Chat", family: "Yi-1.5", params: "9B", paramsB: 9, quant: "Q4_K_M", sizeGB: 5.0, minRamGB: 10, recRamGB: 18, pull: "modelscope.cn/bartowski/Yi-1.5-9B-Chat-GGUF:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "零一万物 Yi-1.5，中英双语均衡，长文写作不错；建议 16GB 以上。" },
  { id: "internlm2.5-7b", name: "InternLM2.5 7B Chat", family: "InternLM2.5", params: "7B", paramsB: 7, quant: "Q4_K_M", sizeGB: 4.7, minRamGB: 8, recRamGB: 16, pull: "modelscope.cn/Shanghai_AI_Laboratory/internlm2_5-7b-chat-gguf:Q4_K_M", category: "对话", chatTemplate: "chatml", desc: "上海 AI 实验室书生·浦语，中文与推理表现稳；建议 16GB 或独显。" },
  { id: "llama3.2-1b", name: "Llama 3.2 1B 指令版", family: "Llama 3.2", params: "1B", paramsB: 1, quant: "Q4_K_M", sizeGB: 0.8, minRamGB: 3, recRamGB: 6, pull: "modelscope.cn/unsloth/Llama-3.2-1B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "llama3", desc: "Meta 出品的超轻量多语言模型，英文场景尤佳；适合边缘设备。" },
  { id: "llama3.2-3b", name: "Llama 3.2 3B 指令版", family: "Llama 3.2", params: "3B", paramsB: 3, quant: "Q4_K_M", sizeGB: 2.0, minRamGB: 5, recRamGB: 8, pull: "modelscope.cn/unsloth/Llama-3.2-3B-Instruct-GGUF:Q4_K_M", category: "对话", chatTemplate: "llama3", desc: "Meta 3B，英文/多语言能力强，速度快；中文略弱于同档 Qwen。" },
  { id: "gemma2-9b", name: "Gemma 2 9B 指令版", family: "Gemma 2", params: "9B", paramsB: 9, quant: "Q4_K_M", sizeGB: 5.8, minRamGB: 10, recRamGB: 18, pull: "modelscope.cn/LLM-Research/gemma-2-9b-it-GGUF:Q4_K_M", category: "对话", chatTemplate: "gemma", desc: "Google Gemma 2，综合质量高、写作流畅；建议 16GB 以上或独显。" },

  // ---------------- 代码：Qwen2.5-Coder（ChatML）----------------
  { id: "qwen2.5-coder-1.5b", name: "Qwen2.5-Coder 1.5B", family: "Qwen2.5-Coder", params: "1.5B", paramsB: 1.5, quant: "Q4_K_M", sizeGB: 1.1, minRamGB: 3, recRamGB: 6, pull: "modelscope.cn/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M", category: "代码", chatTemplate: "chatml", desc: "轻量代码补全/解释，适合做编辑器内联补全。" },
  { id: "qwen2.5-coder-3b", name: "Qwen2.5-Coder 3B", family: "Qwen2.5-Coder", params: "3B", paramsB: 3, quant: "Q4_K_M", sizeGB: 2.0, minRamGB: 5, recRamGB: 8, pull: "modelscope.cn/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M", category: "代码", chatTemplate: "chatml", desc: "代码补全甜点档，普通笔记本即可流畅本地补全。" },
  { id: "qwen2.5-coder-7b", name: "Qwen2.5-Coder 7B", family: "Qwen2.5-Coder", params: "7B", paramsB: 7, quant: "Q4_K_M", sizeGB: 4.7, minRamGB: 8, recRamGB: 16, pull: "modelscope.cn/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M", category: "代码", chatTemplate: "chatml", desc: "本地编程助手主力，写函数/改 bug/解释代码均可；建议 16GB 或独显。" },
  { id: "qwen2.5-coder-14b", name: "Qwen2.5-Coder 14B", family: "Qwen2.5-Coder", params: "14B", paramsB: 14, quant: "Q4_K_M", sizeGB: 9.0, minRamGB: 14, recRamGB: 24, pull: "modelscope.cn/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF:Q4_K_M", category: "代码", chatTemplate: "chatml", desc: "更强的本地编程能力，能写较完整模块；建议大内存或独显。" },
  { id: "qwen2.5-coder-32b", name: "Qwen2.5-Coder 32B", family: "Qwen2.5-Coder", params: "32B", paramsB: 32, quant: "Q4_K_M", sizeGB: 20, minRamGB: 26, recRamGB: 48, pull: "modelscope.cn/Qwen/Qwen2.5-Coder-32B-Instruct-GGUF:Q4_K_M", category: "代码", chatTemplate: "chatml", desc: "接近商用 Copilot 水准的本地代码模型，非常吃资源，建议独显或大内存。" },

  // ---------------- 推理：DeepSeek-R1 蒸馏 / QwQ ----------------
  { id: "ds-r1-qwen-1.5b", name: "DeepSeek-R1-Distill-Qwen 1.5B", family: "DeepSeek-R1", params: "1.5B", paramsB: 1.5, quant: "Q4_K_M", sizeGB: 1.1, minRamGB: 3, recRamGB: 6, pull: "modelscope.cn/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF:Q4_K_M", category: "推理", chatTemplate: "chatml", desc: "带思维链的轻量推理模型，适合数学/逻辑小题；会先“想”再答。" },
  { id: "ds-r1-qwen-7b", name: "DeepSeek-R1-Distill-Qwen 7B", family: "DeepSeek-R1", params: "7B", paramsB: 7, quant: "Q4_K_M", sizeGB: 4.7, minRamGB: 8, recRamGB: 16, pull: "modelscope.cn/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF:Q4_K_M", category: "推理", chatTemplate: "chatml", desc: "更强的本地推理能力，解题/分析更靠谱；建议 16GB 或独显。" },
  { id: "ds-r1-qwen-14b", name: "DeepSeek-R1-Distill-Qwen 14B", family: "DeepSeek-R1", params: "14B", paramsB: 14, quant: "Q4_K_M", sizeGB: 9.0, minRamGB: 14, recRamGB: 24, pull: "modelscope.cn/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF:Q4_K_M", category: "推理", chatTemplate: "chatml", desc: "更高质量的本地推理，数学/代码推理明显更稳；建议大内存或独显。" },
  { id: "ds-r1-qwen-32b", name: "DeepSeek-R1-Distill-Qwen 32B", family: "DeepSeek-R1", params: "32B", paramsB: 32, quant: "Q4_K_M", sizeGB: 20, minRamGB: 26, recRamGB: 48, pull: "modelscope.cn/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF:Q4_K_M", category: "推理", chatTemplate: "chatml", desc: "本地推理天花板档，接近 R1 体验；非常吃资源，建议独显或大内存。" },
  { id: "ds-r1-llama-8b", name: "DeepSeek-R1-Distill-Llama 8B", family: "DeepSeek-R1", params: "8B", paramsB: 8, quant: "Q4_K_M", sizeGB: 4.9, minRamGB: 8, recRamGB: 16, pull: "modelscope.cn/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF:Q4_K_M", category: "推理", chatTemplate: "llama3", desc: "基于 Llama 蒸馏的推理模型，英文推理强；建议 16GB 或独显。" },
  { id: "qwq-32b", name: "QwQ 32B（深度推理）", family: "QwQ", params: "32B", paramsB: 32, quant: "Q4_K_M", sizeGB: 20, minRamGB: 26, recRamGB: 48, pull: "modelscope.cn/Qwen/QwQ-32B-GGUF:Q4_K_M", category: "推理", chatTemplate: "chatml", desc: "阿里 QwQ 专注复杂推理，会长链思考；资源消耗大，适合独显/大内存离线深算。" },
];
