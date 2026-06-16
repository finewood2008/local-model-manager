# 本地模型管理器 · Local Model Manager

> 一个轻量的 **Tauri 2 + React** 桌面 app，用于管理本机 [ollama](https://ollama.com) 的本地模型：模型列表、启停服务、导入 GGUF / 拉取 / 删除、对话测试、资源监控。
>
> A lightweight **Tauri 2 + React** desktop app to manage local [ollama](https://ollama.com) models — list models, start/stop the service, import GGUF / pull / delete, chat-test inference, and monitor resources.

![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)
![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)

---

## ✨ 功能 Features

- **模型列表 + 启停服务** — 查看已安装 / 运行中模型及内存占用，一键启动 / 停止 `ollama serve`，显示版本与 PID。
- **导入 GGUF + 拉取 / 删除** — 从本地 `.gguf` 文件导入（自动生成 Modelfile + `ollama create`，带流式进度）；从仓库 `ollama pull`；删除模型。
- **对话 / 测试推理** — 内置流式聊天面板，显示首 token 延迟与 tok/s；可设置最大生成长度（`num_predict`）并随时**停止生成**。
- **资源监控** — CPU / 内存实时仪表，按模型查看已载入内存占用。
- **暖米主题** — 内置 Warm Cream 亮色 / 墨夜暗色两套主题。

## 📦 环境要求 Prerequisites

- [**ollama**](https://ollama.com/download) 已安装（默认 API `http://127.0.0.1:11434`）。
- **Rust** (stable) + Cargo、**Node.js** 18+ / npm。
- **Tauri 的 Linux 系统库**（首次需装一次）。Debian / Ubuntu 系：

  ```bash
  sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
    build-essential curl wget file libssl-dev \
    libayatana-appindicator3-dev librsvg2-dev pkg-config
  ```
  > 较老的发行版若找不到 `4.1`，改用 `libwebkit2gtk-4.0-dev` + `libsoup2.4-dev`。
  > 其他平台见 [Tauri 官方前置说明](https://tauri.app/start/prerequisites/)。

## 🚀 开发与构建 Development & Build

```bash
npm install            # 安装前端依赖
npm run tauri dev      # 开发模式（启动桌面窗口，热重载）

npm run tauri build    # 打包：独立二进制 + .deb / .rpm（+ AppImage，需联网）
```

构建产物在 `src-tauri/target/release/`：
- `local-model-manager` — 自带前端的独立二进制（无需 dev server）
- `bundle/deb/*.deb`、`bundle/rpm/*.rpm` — 可安装包（安装后在应用菜单出现图标）

## 🏗️ 架构 Architecture

```
src-tauri/src/
  ollama.rs   ollama REST 反代（version/list/ps/show/delete + pull/chat 流式 + 停止生成）
  import.rs   GGUF → ollama create（CLI，流式进度）
  service.rs  ollama serve 探测 / 启动 / 停止
  sysmon.rs   CPU / 内存采集（sysinfo）
  files.rs    扫描 *.gguf
src/
  api/transport.ts        传输抽象接口（可嵌入接缝）
  api/transport.tauri.ts  Tauri 实现（invoke + Channel）
  api/ollama.ts           框架无关的领域客户端
  pages/                  Models / ImportPull / Chat / Monitor
  components/  hooks/  styles/
```

**为什么 ollama 调用走 Rust 代理**：避开 Tauri webview → `localhost:11434` 的 CORS（ollama 默认 `OLLAMA_ORIGINS` 不含 tauri 源）；流式结果用 Tauri `Channel` 推回前端。

**可嵌入设计**：所有领域逻辑集中在 `src/api/ollama.ts`，仅依赖 `transport.ts` 抽象。要嵌入其他宿主（如 Electron 应用）时，只需新增一个 `transport.*.ts`（走宿主自己的 IPC），即可复用全部 React 组件与领域客户端，无需改动业务代码。

## ✅ 快速验证 Smoke Test

1. 启动后顶部服务条显示「运行中」+ 版本 + PID；点「停止服务 / 启动服务」可切换 ollama。
2. 「导入 / 获取」从仓库拉取一个小模型，如 `ollama pull qwen2.5:3b`（或导入本地 GGUF），完成后出现在「模型」列表。
3. 「对话」选该模型发一句话，流式输出、底部显示 tok/s；纯 CPU 机器偏慢属正常，可调小最大生成长度或点「停止」。
4. 「监控」CPU / 内存随负载变化；对话时模型出现在「运行中」并显示内存占用。

## 📝 已知限制 Notes

- 纯 CPU 推理速度取决于硬件；建议在低配机器上使用 3B/1.8B 级别的量化模型。
- 从裸 GGUF 导入的模型若缺少对话模板可能不正常停止——本 app 已用默认 `num_predict` 上限 + 停止按钮兜底，但更推荐 `ollama pull` 官方带模板的版本。
- 第一版不含模型量化转换、远程仓库浏览（后续迭代）。

## 📄 许可证 License

[Apache License 2.0](./LICENSE) © 2026 finewood2008
