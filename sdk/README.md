# @haloforge/plugin-sdk

The official frontend SDK for building HaloForge plugins.

## Install

```bash
npm i @haloforge/plugin-sdk react react-dom @tauri-apps/api lucide-react
npm i -D typescript @types/react @types/react-dom
```

`react`, `react-dom`, `@tauri-apps/api`, and `lucide-react` are peer dependencies and should be installed in the plugin frontend project.

## Minimal Frontend Entry

```tsx
import { definePlugin, invokePlugin, registerPlugin } from "@haloforge/plugin-sdk";

function HelloButton() {
  async function handleClick() {
    const result = await invokePlugin<{ message: string }>("hello", { name: "HaloForge" });
    alert(result.message);
  }

  return <button onClick={() => void handleClick()}>Greet</button>;
}

export default registerPlugin("com.example.hello-plugin", definePlugin({
  slots: {
    "devkit.toolbar": HelloButton,
  },
}));
```

## What To Use

- `definePlugin`: Level 1 and Level 2 plugins such as tabs and slot injections.
- `defineModulePlugin`: Level 0 plugins that provide a full module panel.
- `defineAssistantPlugin`: Level 3 plugins that register an assistant UI.
- `registerPlugin`: register the bundle with HaloForge's runtime registry.
- `invokePlugin`: call commands exposed by your Rust backend.
- `useHostNavigation`, `useHostFileIntent`, `useHostModels`, `useHostAI`: stable host integration hooks for black-box-compatible plugins.
- `pluginDeepLinks`, `onPluginDeepLink`, `usePluginDeepLink`: receive plugin-scoped `haloforge://` launch URLs such as import links.
- `pluginNavigation`, `usePluginNavigation`: synchronize Level 0 plugin pages with HaloForge Back/Forward.
- `pluginWindows`, `usePluginWindows`: ask HaloForge to open plugin routes/resources through the host multi-window dispatcher.
- `pluginCurrentWindow`, `usePluginCurrentWindow`, `usePluginWindowTitle`: update or reset the native title for the active HaloForge window.
- `pickHostFile`, `pickHostDirectory`, `saveHostFile`: stable host file dialog helpers.
- `usePluginSettings`, `useHostData`, `useSlotContext`: read plugin and host state inside your React components.
- `useAppTheme`: read HaloForge theme mode and CSS variables inside your plugin.
- `enterpriseGateway`: call the host-managed image gateway without exposing cloud tokens. The function name is retained for compatibility; user-facing UI should say "HaloForge Cloud gateway" or "Managed gateway".
- `AppSelect`: use the same host-styled dropdown/listbox HaloForge uses in the app.
- `log`, `createPluginLogger`: write plugin frontend diagnostics into the HaloForge application log.

## Public Host API

Prefer these host helpers over reading `window.__HF_HOST` directly:

- `useHostNavigation()` for module switches and settings tabs
- `useHostFileIntent()` for startup/external file-open intents
- `pluginDeepLinks()` / `usePluginDeepLink()` for plugin-scoped `haloforge://` launch URLs
- `pluginNavigation()` / `usePluginNavigation()` for current-window plugin route history
- `pluginWindows()` / `usePluginWindows()` for host-managed route/resource window opening
- `pluginCurrentWindow()` / `usePluginWindowTitle()` for the current native window title
- `pickHostFile()` / `pickHostDirectory()` / `saveHostFile()` for host-owned file dialogs
- `useHostModels()` / `useAvailableModels()` for model lists and current selection
- `useHostAI()` for AI transport, session creation, stream-state polling, and generation stop
- `enterpriseGateway()` for host-managed image generation and image edits
- `useHostTheme()` for theme tokens
- `useHostEvent()` for stable host events
- `log()` / `createPluginLogger()` for app-level plugin diagnostics

These helpers currently adapt to HaloForge's existing host bridge internally, but they give plugin authors one documented surface that can keep working as HaloForge evolves.

## Plugin Deep Links

Plugins can opt in to launch URLs such as:

```text
haloforge://plugin/dev.haloforge.switchboard/v1/import?source=https%3A%2F%2Fexample.com%2Fswitchboard.json
```

Declare the host capability and permission in `manifest.json`:

```json
{
  "host_capabilities": ["deep_links"],
  "permissions": [
    { "type": "host_deep_links" }
  ]
}
```

Then consume the link through the SDK:

```tsx
import { useCallback } from "react";
import { clearPendingPluginDeepLink, usePluginDeepLink } from "@haloforge/plugin-sdk";

export function SwitchboardPanel() {
  usePluginDeepLink(useCallback((link) => {
    if (link.route === "/v1/import") {
      const source = link.params.source;
      // Import your data here.
      console.log("Import switchboard from", source);
      clearPendingPluginDeepLink();
    }
  }, []));

  return null;
}
```

Plugins that do not call these helpers simply ignore deep links routed to them.

## Plugin Routes And Windows

Use `pluginNavigation()` when the plugin changes the page inside the current window. Use `pluginWindows()` when the plugin wants HaloForge to choose the right host window for a plugin route or resource.

```tsx
import { usePluginNavigation, usePluginWindows } from "@haloforge/plugin-sdk";

export function DocumentsPanel() {
  const navigation = usePluginNavigation();
  const windows = usePluginWindows();

  function openDetail(id: string) {
    navigation.pushRoute(`/detail/${id}`, { params: { id } });
  }

  async function openDocument(path: string) {
    await windows.openResource(path, {
      route: "/document",
      params: { path },
      reuseKey: "resource",
      openMode: "reuse_or_new",
    });
  }
}
```

The host combines `pluginWindows()` requests with the manifest `window` policy. Plugins declare intent; HaloForge owns window creation, focus, reuse, restore, and conflict handling.

### Current Window Title

Use `usePluginWindowTitle()` when the active plugin page represents a specific file, task, or record:

```tsx
import { usePluginWindowTitle } from "@haloforge/plugin-sdk";

export function MarkdownPanel({ fileName }: { fileName: string | null }) {
  usePluginWindowTitle(fileName, { subtitle: "Markdown" });
}
```

The host formats the native title as `Title - Subtitle - HaloForge` and rejects updates from plugins that do not own the active plugin module or route.

## Managed Image Gateway

Plugins that need HaloForge-managed image generation must declare and receive approval for:

```json
{
  "host_capabilities": ["enterprise_gateway"],
  "permissions": [
    { "type": "host_enterprise_gateway_access" }
  ]
}
```

The host performs permission checks and forwards the request through the active HaloForge Cloud or Enterprise Server session. Plugins never receive cloud session tokens. Community-compatible plugins should also provide a user-configured OpenAI-compatible base URL fallback when practical.

Then call the SDK helper from registered plugin UI:

```tsx
import { enterpriseGateway } from "@haloforge/plugin-sdk";

export function ImageStudioPanel() {
  async function generate() {
    const gateway = enterpriseGateway();
    const result = await gateway.generateImages({
      model: "gpt-image-1",
      prompt: "Create a polished HaloForge plugin icon.",
      size: "1024x1024",
      n: 1,
      response_format: "url",
    });
    console.log(result.hf_output_assets?.[0]?.public_url ?? result.data?.[0]?.url);
  }

  return <button onClick={() => void generate()}>Generate</button>;
}
```

The function name is retained for compatibility with the first gateway implementation. Plugin UI should describe it as "HaloForge Cloud gateway" or "managed gateway" unless the product surface is explicitly enterprise-only.

## Logging

Use the SDK logger instead of `console.log` for events that should survive outside DevTools:

```tsx
import { createPluginLogger } from "@haloforge/plugin-sdk";

const logger = createPluginLogger("image-generation");

await logger.info("Generation started", {
  model: "gpt-image-2.0",
  size: "1024x1024",
  count: 1,
});

await logger.error("Generation failed", {
  status: 502,
  elapsedMs: 1842,
  error: "upstream gateway timeout",
});
```

HaloForge writes these entries to `~/.haloforge/logs/haloforge.log.YYYY-MM-DD`. Keep `details` JSON-serializable, and never include API keys, bearer tokens, prompt text, or raw image/base64 payloads. Log counts, model IDs, endpoint kind, status, elapsed time, and short error summaries instead.

## Host-styled Selects

```tsx
import { AppSelect } from "@haloforge/plugin-sdk";

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <AppSelect
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
    >
      <option value="gpt-5.4">GPT-5.4</option>
      <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
    </AppSelect>
  );
}
```

`AppSelect` follows the active HaloForge theme automatically, so plugin dropdowns match the host app in both light and dark mode.

## Host-styled Tooltips

```tsx
import { AppTooltip } from "@haloforge/plugin-sdk";

export function IconAction() {
  return (
    <AppTooltip content="Retry task" placement="top">
      <button type="button" aria-label="Retry task">
        Retry
      </button>
    </AppTooltip>
  );
}
```

`AppTooltip` renders a fixed-position overlay and clamps itself to the viewport, so it stays visible inside clipped plugin panels, galleries, and toolbar edges.

## Typical Setup

1. Build the native backend with `haloforge-plugin-api`.
2. Build the frontend bundle with this SDK.
3. Point `manifest.json` to the emitted frontend file via `entry.frontend`.
4. Load the plugin inside HaloForge and call `invokePlugin` from mounted components.

## Related Packages

- Rust backend crate: `haloforge-plugin-api`
- Repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI
