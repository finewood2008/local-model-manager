mod files;
mod import;
mod ollama;
mod service;
mod sysmon;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // ollama 非流式
            ollama::ollama_version,
            ollama::ollama_list,
            ollama::ollama_ps,
            ollama::ollama_show,
            ollama::ollama_delete,
            // ollama 流式
            ollama::ollama_pull,
            ollama::ollama_chat,
            ollama::ollama_stop_chat,
            import::ollama_create_from_gguf,
            // 服务控制
            service::service_status,
            service::service_start,
            service::service_stop,
            // 系统监控 & 文件
            sysmon::system_stats,
            files::list_gguf_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
