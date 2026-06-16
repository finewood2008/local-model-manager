//! ollama 服务（`ollama serve`）的探测 / 启动 / 停止。

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Serialize)]
pub struct ServiceStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub version: Option<String>,
}

/// 在进程表里找 `ollama serve`（排除本管理器自身派生的 runner）。
fn find_serve_pid() -> Option<u32> {
    let mut sys = System::new();
    // 必须用 everything() 才会刷新命令行(cmd)，默认 refresh_processes 不含 cmd
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );
    for (pid, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy().to_lowercase();
        if !name.contains("ollama") {
            continue;
        }
        let cmd: Vec<String> = proc_
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        // serve 进程的命令行里含 "serve"，runner 含 "runner" —— 只认 serve
        if cmd.iter().any(|a| a == "serve") {
            return Some(pid.as_u32());
        }
    }
    None
}

async fn probe_version() -> Option<String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;
    let resp = client
        .get(format!("{}/api/version", crate::ollama::OLLAMA_HOST))
        .send()
        .await
        .ok()?;
    let v = resp.json::<serde_json::Value>().await.ok()?;
    v.get("version").and_then(|s| s.as_str()).map(String::from)
}

#[tauri::command]
pub async fn service_status() -> ServiceStatus {
    let version = probe_version().await;
    let pid = find_serve_pid();
    ServiceStatus {
        // API 通即视为 running（即便不是我们启动的）
        running: version.is_some() || pid.is_some(),
        pid,
        version,
    }
}

#[tauri::command]
pub async fn service_start() -> Result<(), String> {
    // 已在跑则幂等返回
    if probe_version().await.is_some() || find_serve_pid().is_some() {
        return Ok(());
    }
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/ollama.log")
        .map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    std::process::Command::new("ollama")
        .arg("serve")
        .stdout(std::process::Stdio::from(log))
        .stderr(std::process::Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("启动 ollama serve 失败: {e}（ollama 在 PATH 中吗？）"))?;

    // 等待 API 就绪（最多 ~10s）
    for _ in 0..20 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if probe_version().await.is_some() {
            return Ok(());
        }
    }
    Err("已启动进程但 API 在超时内未就绪".into())
}

#[tauri::command]
pub async fn service_stop() -> Result<(), String> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );
    // 结束所有 ollama 进程：serve + runner（runner 是子进程，单杀 serve 可能残留）
    let mut killed = 0;
    for (_pid, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy().to_lowercase();
        let exe_is_ollama = proc_
            .exe()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_lowercase().contains("ollama"))
            .unwrap_or(false);
        if name.contains("ollama") || exe_is_ollama {
            proc_.kill();
            killed += 1;
        }
    }
    if killed == 0 {
        return Ok(()); // 本来就没在跑
    }
    Ok(())
}
