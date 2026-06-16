//! 扫描目录下的 *.gguf 文件，供「导入」页快捷选择。

use serde::Serialize;

#[derive(Serialize)]
pub struct GgufFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[tauri::command]
pub async fn list_gguf_files(dir: String) -> Result<Vec<GgufFile>, String> {
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("读取目录 {dir} 失败: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false)
        {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            out.push(GgufFile {
                path: path.to_string_lossy().to_string(),
                name,
                size,
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}
