import { useEffect, useState } from "react";
import { useServiceStatus } from "./hooks/useServiceStatus";
import { ModelsPage } from "./pages/ModelsPage";
import { ImportPullPage } from "./pages/ImportPullPage";
import { ChatPage } from "./pages/ChatPage";
import { MonitorPage } from "./pages/MonitorPage";

type Tab = "models" | "import" | "chat" | "monitor";

const NAV: { key: Tab; icon: string; label: string }[] = [
  { key: "models", icon: "◆", label: "模型" },
  { key: "import", icon: "↥", label: "导入 / 获取" },
  { key: "chat", icon: "💬", label: "对话" },
  { key: "monitor", icon: "📊", label: "监控" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("models");
  const [chatModel, setChatModel] = useState<string | undefined>();
  const { status, refresh } = useServiceStatus();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light"
    );
  }, [dark]);

  function testModel(name: string) {
    setChatModel(name);
    setTab("chat");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="dot" />
          本地模型
        </div>
        {NAV.map((n) => (
          <div
            key={n.key}
            className={`nav-item ${tab === n.key ? "active" : ""}`}
            onClick={() => setTab(n.key)}
          >
            <span className="ico">{n.icon}</span>
            {n.label}
          </div>
        ))}
        <div className="spacer" />
        <div className="theme-toggle" onClick={() => setDark((d) => !d)}>
          {dark ? "☀ 切到暖米" : "🌙 切到墨夜"}
        </div>
      </aside>

      <main className="main">
        {tab === "models" && (
          <ModelsPage
            serviceStatus={status}
            refreshService={refresh}
            onTestModel={testModel}
          />
        )}
        {tab === "import" && (
          <ImportPullPage
            serviceStatus={status}
            refreshService={refresh}
            onDone={refresh}
          />
        )}
        {tab === "chat" && (
          <ChatPage
            serviceStatus={status}
            refreshService={refresh}
            preselect={chatModel}
          />
        )}
        {tab === "monitor" && (
          <MonitorPage
            serviceStatus={status}
            refreshService={refresh}
            active={tab === "monitor"}
          />
        )}
      </main>
    </div>
  );
}
