//! 系统资源采集（CPU / 内存）。GPU 本机为纯 CPU，暂不采集显存。

use serde::Serialize;
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
