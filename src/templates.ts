// 对话模板预设。
// GGUF 导入 ollama 时若不写 TEMPLATE，ollama 会退化成透传模板 `{{ .Prompt }}`，
// 导致 /api/chat 不加角色标记/停止符，小模型只会续写 → “自问自答 / 虚拟对话”。
// 这里给出常见模型族的模板 + 停止符，导入时一并写进 Modelfile。

export interface ChatTemplate {
  /** ollama Modelfile 的 TEMPLATE（Go 模板）；空串表示用 GGUF 自带、不写 TEMPLATE */
  template: string;
  /** PARAMETER stop 列表 */
  stop: string[];
}

// ChatML —— Qwen / 通义千问、Hunyuan 混元、Yi、DeepSeek、InternLM 等绝大多数国产小模型
const CHATML = `{{- if .Messages }}
{{- if or .System .Tools }}<|im_start|>system
{{- if .System }}
{{ .System }}
{{- end }}
{{- if .Tools }}

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{{- range .Tools }}
{"type": "function", "function": {{ .Function }}}
{{- end }}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>
{{- end }}<|im_end|>
{{ end }}
{{- range $i, $_ := .Messages }}
{{- $last := eq (len (slice $.Messages $i)) 1 -}}
{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ if .Content }}{{ .Content }}
{{- else if .ToolCalls }}<tool_call>
{{ range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ .Function.Arguments }}}
{{ end }}</tool_call>
{{- end }}{{ if not $last }}<|im_end|>
{{ end }}
{{- else if eq .Role "tool" }}<|im_start|>user
<tool_response>
{{ .Content }}
</tool_response><|im_end|>
{{ end }}
{{- if and (ne .Role "assistant") $last }}<|im_start|>assistant
{{ end }}
{{- end }}
{{- else }}
{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ end }}{{ .Response }}{{ if .Response }}<|im_end|>{{ end }}`;

// Llama-3 / Llama-3.x
const LLAMA3 = `{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ range .Messages }}<|start_header_id|>{{ .Role }}<|end_header_id|>

{{ .Content }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

`;

// Gemma / Gemma2
const GEMMA = `{{ if .System }}<start_of_turn>user
{{ .System }}<end_of_turn>
{{ end }}{{ range .Messages }}<start_of_turn>{{ if eq .Role "assistant" }}model{{ else }}user{{ end }}
{{ .Content }}<end_of_turn>
{{ end }}<start_of_turn>model
`;

export interface TemplatePreset {
  key: string;
  label: string;
  tmpl: ChatTemplate;
}

/** 按 key 取模板（供模型市场下载后套用）。未命中返回空模板。 */
export function getChatTemplate(key: string): ChatTemplate {
  const p = TEMPLATE_PRESETS.find((t) => t.key === key);
  return p ? p.tmpl : { template: "", stop: [] };
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "chatml",
    label: "ChatML（Qwen/通义·Hunyuan混元·Yi·DeepSeek·InternLM）",
    tmpl: { template: CHATML, stop: ["<|im_start|>", "<|im_end|>"] },
  },
  {
    key: "llama3",
    label: "Llama-3 / Llama-3.x",
    tmpl: {
      template: LLAMA3,
      stop: ["<|eot_id|>", "<|end_of_text|>", "<|start_header_id|>"],
    },
  },
  {
    key: "gemma",
    label: "Gemma / Gemma2",
    tmpl: { template: GEMMA, stop: ["<end_of_turn>"] },
  },
  {
    key: "auto",
    label: "自动（用 GGUF 自带模板，不推荐——多数 GGUF 不带）",
    tmpl: { template: "", stop: [] },
  },
  {
    key: "custom",
    label: "自定义（手动填写）",
    tmpl: { template: "", stop: [] },
  },
];
