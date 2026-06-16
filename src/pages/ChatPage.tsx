import { useEffect, useRef, useState } from "react";
import { chat, listModels, stopChat, type ChatMessage } from "../api/ollama";
import { ServiceBar } from "../components/ServiceBar";
import type { ServiceStatus } from "../api/ollama";
import type { StreamEvent } from "../api/transport";

interface Props {
  serviceStatus: ServiceStatus | null;
  refreshService: () => void;
  preselect?: string;
}

export function ChatPage({ serviceStatus, refreshService, preselect }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(preselect ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<string>("");
  const [maxTokens, setMaxTokens] = useState(512);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listModels()
      .then((m) => {
        const names = m.map((x) => x.name);
        setModels(names);
        if (!model && names.length) setModel(preselect ?? names[0]);
      })
      .catch(() => setModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (preselect) setModel(preselect);
  }, [preselect]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!input.trim() || !model || busy) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setMetric("");

    const start = performance.now();
    let firstAt = 0;
    let acc = "";

    try {
      // 默认上限 num_predict，避免跑飞的模型在纯 CPU 上无限生成
      const options = { num_predict: maxTokens };
      await chat(model, history, options, (ev: StreamEvent) => {
        if (ev.type === "data") {
          const p = ev.payload as any;
          if (p.message?.content) {
            if (!firstAt) firstAt = performance.now();
            acc += p.message.content;
            setMessages((msgs) => {
              const next = [...msgs];
              next[next.length - 1] = { role: "assistant", content: acc };
              return next;
            });
          }
          if (p.done) {
            const ttft = firstAt ? Math.round(firstAt - start) : 0;
            let tps = "";
            if (p.eval_count && p.eval_duration) {
              tps = ` · ${(p.eval_count / (p.eval_duration / 1e9)).toFixed(1)} tok/s`;
            }
            setMetric(`首 token ${ttft}ms${tps}`);
          }
        } else if (ev.type === "error") {
          acc += `\n❌ ${ev.message}`;
          setMessages((msgs) => {
            const next = [...msgs];
            next[next.length - 1] = { role: "assistant", content: acc };
            return next;
          });
        }
      });
    } catch (e) {
      setMessages((msgs) => {
        const next = [...msgs];
        next[next.length - 1] = {
          role: "assistant",
          content: acc + `\n❌ ${String(e)}`,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    try {
      await stopChat();
    } catch {
      /* ignore */
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <ServiceBar status={serviceStatus} onChanged={refreshService} />
      <div className="page" style={{ display: "flex", flexDirection: "column" }}>
        <div className="chat-wrap">
          <div className="chat-head">
            <select
              className="select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.length === 0 && <option value="">（无可用模型）</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="grow" />
            <label
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              最大生成
              <input
                className="input"
                type="number"
                min={16}
                max={8192}
                step={64}
                value={maxTokens}
                onChange={(e) =>
                  setMaxTokens(Math.max(16, parseInt(e.target.value, 10) || 512))
                }
                style={{ width: 84, padding: "4px 8px" }}
              />
              token
            </label>
            <button
              className="btn sm"
              onClick={() => {
                setMessages([]);
                setMetric("");
              }}
            >
              清空对话
            </button>
          </div>

          <div className="chat-log" ref={logRef}>
            {messages.length === 0 && (
              <div className="empty">选择模型，输入消息开始测试本地推理</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (busy && i === messages.length - 1 ? "▍" : "")}
              </div>
            ))}
          </div>

          {metric && <div className="metric-line">{metric}</div>}

          <div className="chat-input">
            <textarea
              className="textarea"
              value={input}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={!model}
            />
            {busy ? (
              <button className="btn danger" onClick={stop}>
                停止
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={send}
                disabled={!input.trim() || !model}
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
