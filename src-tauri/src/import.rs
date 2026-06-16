//! 从本地 GGUF 文件导入模型到 ollama。
//! 生成临时 Modelfile，再调用 `ollama create <name> -f <modelfile>`（CLI 跨版本最稳），
//! 把 stdout/stderr 逐行通过 Channel 推回前端做进度展示。

use crate::ollama::StreamEvent;
use serde::Deserialize;
use std::process::Stdio;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Deserialize, Default)]
pub struct ImportParams {
    /// 上下文长度
    pub num_ctx: Option<u32>,
    /// system prompt
    pub system: Option<String>,
    /// temperature
    pub temperature: Option<f32>,
}

fn build_modelfile(gguf_path: &str, params: &ImportParams) -> String {
    let mut lines = vec![format!("FROM {gguf_path}")];
    if let Some(n) = params.num_ctx {
        lines.push(format!("PARAMETER num_ctx {n}"));
    }
    if let Some(t) = params.temperature {
        lines.push(format!("PARAMETER temperature {t}"));
    }
    if let Some(s) = &params.system {
        if !s.trim().is_empty() {
            // 用三引号包裹，支持多行
            lines.push(format!("SYSTEM \"\"\"{s}\"\"\""));
        }
    }
    lines.join("\n") + "\n"
}

#[tauri::command]
pub async fn ollama_create_from_gguf(
    name: String,
    gguf_path: String,
    params: Option<ImportParams>,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let params = params.unwrap_or_default();

    // 校验 GGUF 存在
    if !std::path::Path::new(&gguf_path).exists() {
        let msg = format!("GGUF 文件不存在: {gguf_path}");
        let _ = on_event.send(StreamEvent::Error {
            message: msg.clone(),
        });
        let _ = on_event.send(StreamEvent::Done);
        return Err(msg);
    }

    // 写临时 Modelfile
    let modelfile = build_modelfile(&gguf_path, &params);
    let dir = std::env::temp_dir();
    let mf_path = dir.join(format!("lmm-modelfile-{}", sanitize(&name)));
    if let Err(e) = std::fs::write(&mf_path, &modelfile) {
        let msg = format!("写 Modelfile 失败: {e}");
        let _ = on_event.send(StreamEvent::Error {
            message: msg.clone(),
        });
        let _ = on_event.send(StreamEvent::Done);
        return Err(msg);
    }
    let _ = on_event.send(StreamEvent::Line {
        text: format!("Modelfile:\n{modelfile}"),
    });

    // 执行 ollama create，合并 stderr 到 stdout 逐行读取
    let mut child = match Command::new("ollama")
        .arg("create")
        .arg(&name)
        .arg("-f")
        .arg(&mf_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("启动 ollama create 失败: {e}（ollama 是否在 PATH 中？）");
            let _ = on_event.send(StreamEvent::Error {
                message: msg.clone(),
            });
            let _ = on_event.send(StreamEvent::Done);
            return Err(msg);
        }
    };

    if let Some(stdout) = child.stdout.take() {
        let ev = on_event.clone();
        let mut reader = BufReader::new(stdout).lines();
        tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = ev.send(StreamEvent::Line { text: line });
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let ev = on_event.clone();
        let mut reader = BufReader::new(stderr).lines();
        tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = ev.send(StreamEvent::Line { text: line });
            }
        });
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&mf_path);
    if status.success() {
        let _ = on_event.send(StreamEvent::Line {
            text: format!("✅ 模型 {name} 创建完成"),
        });
        let _ = on_event.send(StreamEvent::Done);
        Ok(())
    } else {
        let msg = format!("ollama create 退出码非 0: {status}");
        let _ = on_event.send(StreamEvent::Error {
            message: msg.clone(),
        });
        let _ = on_event.send(StreamEvent::Done);
        Err(msg)
    }
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}
