//! 从本地 GGUF 文件导入模型到 ollama。
//! 生成临时 Modelfile，再调用 `ollama create <name> -f <modelfile>`（CLI 跨版本最稳），
//! 把 stdout/stderr 逐行通过 Channel 推回前端做进度展示。

use crate::ollama::StreamEvent;
use serde::Deserialize;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// 临时 Modelfile 唯一计数，避免并发/同名导入互相覆盖。
static MF_SEQ: AtomicU64 = AtomicU64::new(0);

/// PARAMETER stop 的值需转义反斜杠与双引号，否则含引号的 stop 会破坏引号配对。
fn escape_stop(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// 三引号块（TEMPLATE/SYSTEM）无转义机制：值里出现 `"""` 会提前闭合（模板本身可含换行，故只查三引号）。
fn reject_triple_quote(value: &str, what: &str) -> Result<(), String> {
    if value.contains("\"\"\"") {
        return Err(format!("{what} 含非法的三引号序列 \"\"\""));
    }
    Ok(())
}

/// 单行字段（FROM 路径 / base / 模型名）不能含换行，否则可注入额外 Modelfile 指令。
fn reject_control_line(value: &str, what: &str) -> Result<(), String> {
    if value.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
        return Err(format!("{what} 含非法的换行/控制字符"));
    }
    Ok(())
}

#[derive(Deserialize, Default)]
pub struct ImportParams {
    /// 上下文长度
    pub num_ctx: Option<u32>,
    /// system prompt
    pub system: Option<String>,
    /// temperature
    pub temperature: Option<f32>,
    /// 对话模板（ollama Modelfile TEMPLATE，Go 模板）。不写则 ollama 退化成
    /// 透传模板 `{{ .Prompt }}`，导致 /api/chat 无角色标记/停止符 → 模型自问自答。
    pub template: Option<String>,
    /// 停止符（PARAMETER stop）
    pub stop: Option<Vec<String>>,
}

fn build_modelfile(gguf_path: &str, params: &ImportParams) -> Result<String, String> {
    reject_control_line(gguf_path, "GGUF 路径")?;
    let mut lines = vec![format!("FROM {gguf_path}")];
    if let Some(tmpl) = &params.template {
        if !tmpl.trim().is_empty() {
            reject_triple_quote(tmpl, "对话模板")?;
            lines.push(format!("TEMPLATE \"\"\"{tmpl}\"\"\""));
        }
    }
    for s in params.stop.iter().flatten() {
        if !s.is_empty() {
            lines.push(format!("PARAMETER stop \"{}\"", escape_stop(s)));
        }
    }
    if let Some(n) = params.num_ctx {
        lines.push(format!("PARAMETER num_ctx {n}"));
    }
    if let Some(t) = params.temperature {
        lines.push(format!("PARAMETER temperature {t}"));
    }
    if let Some(s) = &params.system {
        if !s.trim().is_empty() {
            reject_triple_quote(s, "System Prompt")?;
            lines.push(format!("SYSTEM \"\"\"{s}\"\"\""));
        }
    }
    Ok(lines.join("\n") + "\n")
}

/// 写临时 Modelfile，跑 `ollama create <name> -f`，stdout/stderr 逐行推回前端。
async fn run_ollama_create(
    name: &str,
    modelfile: &str,
    on_event: &Channel<StreamEvent>,
) -> Result<(), String> {
    // 唯一文件名（pid + 自增序号），并以 create_new(O_EXCL) 防符号链接覆盖/并发碰撞。
    let seq = MF_SEQ.fetch_add(1, Ordering::SeqCst);
    let mf_path = std::env::temp_dir().join(format!(
        "lmm-modelfile-{}-{}-{}",
        std::process::id(),
        seq,
        sanitize(name)
    ));
    let write_res = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&mf_path)
        .and_then(|mut f| std::io::Write::write_all(&mut f, modelfile.as_bytes()));
    if let Err(e) = write_res {
        let msg = format!("写 Modelfile 失败: {e}");
        let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
        let _ = on_event.send(StreamEvent::Done);
        return Err(msg);
    }

    let mut child = match Command::new("ollama")
        .arg("create")
        .arg(name)
        .arg("-f")
        .arg(&mf_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("启动 ollama create 失败: {e}（ollama 是否在 PATH 中？）");
            let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
            let _ = on_event.send(StreamEvent::Done);
            return Err(msg);
        }
    };

    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        let ev = on_event.clone();
        let mut reader = BufReader::new(stdout).lines();
        readers.push(tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = ev.send(StreamEvent::Line { text: line });
            }
        }));
    }
    if let Some(stderr) = child.stderr.take() {
        let ev = on_event.clone();
        let mut reader = BufReader::new(stderr).lines();
        readers.push(tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = ev.send(StreamEvent::Line { text: line });
            }
        }));
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    // 等两个读取任务把管道残留输出排空，再发完成事件，避免 Line 落在 Done 之后。
    for r in readers {
        let _ = r.await;
    }
    let _ = std::fs::remove_file(&mf_path);
    if status.success() {
        let _ = on_event.send(StreamEvent::Line {
            text: format!("✅ 模型 {name} 创建完成"),
        });
        let _ = on_event.send(StreamEvent::Done);
        Ok(())
    } else {
        let msg = format!("ollama create 退出码非 0: {status}");
        let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
        let _ = on_event.send(StreamEvent::Done);
        Err(msg)
    }
}

#[tauri::command]
pub async fn ollama_create_from_gguf(
    name: String,
    gguf_path: String,
    params: Option<ImportParams>,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let params = params.unwrap_or_default();
    if !std::path::Path::new(&gguf_path).exists() {
        let msg = format!("GGUF 文件不存在: {gguf_path}");
        let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
        let _ = on_event.send(StreamEvent::Done);
        return Err(msg);
    }
    let modelfile = match build_modelfile(&gguf_path, &params) {
        Ok(m) => m,
        Err(msg) => {
            let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
            let _ = on_event.send(StreamEvent::Done);
            return Err(msg);
        }
    };
    let _ = on_event.send(StreamEvent::Line {
        text: format!("Modelfile:\n{modelfile}"),
    });
    run_ollama_create(&name, &modelfile, &on_event).await
}

/// 给一个已存在的模型(base)套上正确对话模板，另存为 name。
/// 用于模型市场：从 ModelScope 拉来的 GGUF 是空模板，下载后用此修正。
/// base 与 name 可不同；复用 base 的权重 blob，秒级完成、无需重下。
#[tauri::command]
pub async fn ollama_apply_template(
    base: String,
    name: String,
    template: String,
    stop: Vec<String>,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let build = || -> Result<String, String> {
        reject_control_line(&base, "base 模型")?;
        let mut lines = vec![format!("FROM {base}")];
        if !template.trim().is_empty() {
            reject_triple_quote(&template, "对话模板")?;
            lines.push(format!("TEMPLATE \"\"\"{template}\"\"\""));
        }
        for s in stop.iter().filter(|s| !s.is_empty()) {
            lines.push(format!("PARAMETER stop \"{}\"", escape_stop(s)));
        }
        Ok(lines.join("\n") + "\n")
    };
    let modelfile = match build() {
        Ok(m) => m,
        Err(msg) => {
            let _ = on_event.send(StreamEvent::Error { message: msg.clone() });
            let _ = on_event.send(StreamEvent::Done);
            return Err(msg);
        }
    };
    run_ollama_create(&name, &modelfile, &on_event).await
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}
