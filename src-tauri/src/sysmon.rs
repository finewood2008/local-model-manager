//! 系统资源采集（CPU / 内存 / GPU）。
//! system_stats: 实时占用（监控页轮询）。
//! hardware_info: 静态硬件画像（模型市场据此评估能否跑得动）。

use serde::Serialize;
use std::process::Command as StdCommand;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemStats {
    /// 全局 CPU 使用率 0-100
    pub cpu_usage: f32,
    pub cpu_count: usize,
    /// 字节
    pub mem_total: u64,
    pub mem_used: u64,
    pub mem_available: u64,
}

#[tauri::command]
pub async fn system_stats() -> SystemStats {
    let mut sys = System::new();
    // CPU 使用率需两次采样
    sys.refresh_cpu_usage();
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage = sys.global_cpu_usage();
    let cpu_count = sys.cpus().len();
    let mem_total = sys.total_memory();
    let mem_available = sys.available_memory();
    let mem_used = mem_total.saturating_sub(mem_available);

    SystemStats {
        cpu_usage,
        cpu_count,
        mem_total,
        mem_used,
        mem_available,
    }
}

// ---------- 静态硬件画像 ----------

#[derive(Serialize)]
pub struct GpuInfo {
    pub name: String,
    /// 显存字节数（无法获取则 0）
    pub vram_total: u64,
    /// nvidia | amd | integrated | unknown
    pub kind: String,
}

#[derive(Serialize)]
pub struct HardwareInfo {
    pub os: String,
    pub arch: String,
    pub cpu_brand: String,
    pub cpu_physical_cores: usize,
    pub cpu_threads: usize,
    /// 字节
    pub mem_total: u64,
    pub mem_available: u64,
    pub gpus: Vec<GpuInfo>,
}

/// 探测独立显卡（当前支持 NVIDIA；无独显时返回空 → 走 CPU 评估）。
fn detect_gpus() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();
    if let Ok(out) = StdCommand::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 2 && !parts[0].is_empty() {
                    let mib: u64 = parts[1].parse().unwrap_or(0);
                    gpus.push(GpuInfo {
                        name: parts[0].to_string(),
                        vram_total: mib * 1024 * 1024,
                        kind: "nvidia".into(),
                    });
                }
            }
        }
    }
    gpus
}

#[tauri::command]
pub async fn hardware_info() -> HardwareInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let cpu_threads = sys.cpus().len();
    let cpu_physical_cores = sys.physical_core_count().unwrap_or(cpu_threads);

    HardwareInfo {
        os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
        arch: std::env::consts::ARCH.to_string(),
        cpu_brand,
        cpu_physical_cores,
        cpu_threads,
        mem_total: sys.total_memory(),
        mem_available: sys.available_memory(),
        gpus: detect_gpus(),
    }
}
