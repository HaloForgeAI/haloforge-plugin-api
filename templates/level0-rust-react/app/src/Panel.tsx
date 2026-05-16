import { useMemo, useState } from "react";
import { Blocks, RefreshCw } from "lucide-react";
import { AppSelect, invokePlugin, useHostTheme } from "@haloforge/plugin-sdk";

type Locale = "en" | "zh";

const STRINGS = {
  en: {
    title: "Template Plugin",
    subtitle: "A native HaloForge module using the public plugin SDK.",
    mode: "Mode",
    overview: "Overview",
    diagnostics: "Diagnostics",
    ping: "Ping backend",
    pending: "No backend response yet.",
    ready: "Backend responded.",
    failed: "Backend call failed.",
  },
  zh: {
    title: "模板插件",
    subtitle: "使用公开插件 SDK 的 HaloForge 原生模块。",
    mode: "模式",
    overview: "概览",
    diagnostics: "诊断",
    ping: "请求后端",
    pending: "还没有后端响应。",
    ready: "后端已响应。",
    failed: "后端调用失败。",
  },
} satisfies Record<Locale, Record<string, string>>;

interface PingResult {
  ok: boolean;
  message: string;
}

function getLocale(): Locale {
  const stored = localStorage.getItem("hf:locale") ?? "";
  const language = stored || navigator.language;
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function TemplatePanel() {
  const { theme } = useHostTheme();
  const locale = useMemo(getLocale, []);
  const t = STRINGS[locale];
  const [mode, setMode] = useState("overview");
  const [result, setResult] = useState<string>(t.pending);
  const [busy, setBusy] = useState(false);

  async function pingBackend() {
    setBusy(true);
    try {
      const response = await invokePlugin<PingResult>("template_ping", { mode });
      setResult(response.ok ? `${t.ready} ${response.message}` : t.failed);
    } catch (error) {
      setResult(error instanceof Error ? error.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hftp-root" data-theme={theme.type}>
      <header className="hftp-header">
        <div className="hftp-title">
          <Blocks size={20} aria-hidden="true" />
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>
        <label className="hftp-select-field">
          <span>{t.mode}</span>
          <AppSelect value={mode} onChange={(event) => setMode(event.target.value)} className="hftp-select">
            <option value="overview">{t.overview}</option>
            <option value="diagnostics">{t.diagnostics}</option>
          </AppSelect>
        </label>
      </header>

      <main className="hftp-main">
        <div className="hftp-panel">
          <button className="hftp-button" type="button" onClick={() => void pingBackend()} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" />
            {t.ping}
          </button>
          <p>{result}</p>
        </div>
      </main>
    </section>
  );
}
