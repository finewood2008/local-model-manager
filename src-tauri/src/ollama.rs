//! ollama REST 反向代理。
//! 所有对 ollama 的调用都经此走 Rust 端，避开 Tauri webview 的 CORS 限制；
//! 流式接口（pull/chat/create）通过 tauri::ipc::Channel 把分片推回前端。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::ipc::Channel;

pub const OLLAMA_HOST: &str = "http://127.0.0.1:11434";

/// 对话生成的全局取消标志（测试聊天面板为单会话，单个标志足够）。
/// 置 true 时，正在进行的 ollama_chat 流会中断（丢弃连接→ollama 停止生成）。
static CANCEL_CHAT: AtomicBool = AtomicBool::new(false);
/// pull 用的“永不取消”占位标志。
static NEVER_CANCEL: AtomicBool = AtomicBool::new(false);

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        // 本地模型加载/推理可能很慢，整体不设硬超时，仅设连接超时
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("build reqwest client")
}

/// 流式事件：统一外壳，前端按 type 区分。
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// 一条来自 ollama 的 NDJSON / CLI 输出
    Data { payload: Value },
    /// 纯文本行（CLI 进度）
    Line { text: String },
    /// 出错
    Error { message: String },
    /// 结束
    Done,
}

// ---------- 非流式 ----------

#[tauri::command]
pub async fn ollama_version() -> Result<Value, String> {
    let resp = client()
        .get(format!("{OLLAMA_HOST}/api/version"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ollama_list() -> Result<Value, String> {
    let resp = client()
        .get(format!("{OLLAMA_HOST}/api/tags"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ollama_ps() -> Result<Value, String> {
    let resp = client()
        .get(format!("{OLLAMA_HOST}/api/ps"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ollama_show(name: String) -> Result<Value, String> {
    let resp = client()
        .post(format!("{OLLAMA_HOST}/api/show"))
        .json(&json!({ "model": name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ollama_delete(name: String) -> Result<(), String> {
    let resp = client()
        .delete(format!("{OLLAMA_HOST}/api/delete"))
        .json(&json!({ "model": name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "删除失败: {} {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        ))
    }
}

// ---------- 流式：把响应体按 NDJSON 逐行推给前端 ----------

async fn stream_ndjson(
    resp: reqwest::Response,
    on_event: &Channel<StreamEvent>,
    cancel: &AtomicBool,
) {
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let _ = on_event.send(StreamEvent::Error {
            message: format!("{status} {body}"),
        });
        let _ = on_event.send(StreamEvent::Done);
        return;
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        // 用户点了“停止”：中断循环，drop stream 即关闭连接，ollama 随之停止生成
        if cancel.load(Ordering::SeqCst) {
            let _ = on_event.send(StreamEvent::Done);
            return;
        }
        match chunk {
            Ok(bytes) => {
                buf.extend_from_slice(&bytes);
                // 按换行切分，保留最后一段不完整的
                while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=pos).collect();
                    let line = String::from_utf8_lossy(&line);
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<Value>(line) {
                        Ok(payload) => {
                            let _ = on_event.send(StreamEvent::Data { payload });
                        }
                        Err(_) => {
                            let _ = on_event.send(StreamEvent::Line {
                                text: line.to_string(),
                            });
                        }
                    }
                }
            }
            Err(e) => {
                let _ = on_event.send(StreamEvent::Error {
                    message: e.to_string(),
                });
                break;
            }
        }
    }
    // 处理结尾残留
    let tail = String::from_utf8_lossy(&buf);
    let tail = tail.trim();
    if !tail.is_empty() {
        if let Ok(payload) = serde_json::from_str::<Value>(tail) {
            let _ = on_event.send(StreamEvent::Data { payload });
        }
    }
    let _ = on_event.send(StreamEvent::Done);
}

#[tauri::command]
pub async fn ollama_pull(name: String, on_event: Channel<StreamEvent>) -> Result<(), String> {
    let resp = client()
        .post(format!("{OLLAMA_HOST}/api/pull"))
        .json(&json!({ "model": name, "stream": true }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    stream_ndjson(resp, &on_event, &NEVER_CANCEL).await;
    Ok(())
}

/// 停止当前对话生成。
#[tauri::command]
pub fn ollama_stop_chat() {
    CANCEL_CHAT.store(true, Ordering::SeqCst);
}

#[derive(Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn ollama_chat(
    model: String,
    messages: Vec<ChatMessage>,
    options: Option<Value>,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let msgs: Vec<Value> = messages
        .into_iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    let mut body = json!({
        "model": model,
        "messages": msgs,
        "stream": true,
    });
    if let Some(opts) = options {
        body["options"] = opts;
    }
    // 开始新一轮生成，清掉上一次的取消标志
    CANCEL_CHAT.store(false, Ordering::SeqCst);
    let resp = client()
        .post(format!("{OLLAMA_HOST}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    stream_ndjson(resp, &on_event, &CANCEL_CHAT).await;
    Ok(())
}
