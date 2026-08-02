# Public Host API

HaloForge plugins should be able to feel deeply integrated even when the host is treated as a black box.

This repository now exposes a documented host-facing layer across all three deliverables:

1. Rust crate: `haloforge-plugin-api`
2. Frontend SDK: `@haloforge/plugin-sdk`
3. Packaging / linting CLI: `@haloforge/plugin-pack`

## Goal

Plugin authors should depend on documented SDK APIs instead of:

- reading `window.__HF_HOST` directly
- polling private host stores
- hard-coding internal host IPC command names

## Manifest additions

Plugins can now declare:

```json
{
  "compatibility": {
    "min_app_version": "0.8.0",
    "min_host_api_version": "0.2.18"
  },
  "host_capabilities": [
    "navigation",
    "app_state",
    "file_intents",
    "file_dialogs",
    "file_watch",
    "aichat",
    "enterprise_gateway",
    "deep_links",
    "theme_read",
    "event_subscribe"
  ],
  "window": {
    "default_open_mode": "reuse_or_new",
    "reuse_key": "resource",
    "allow_multiple": true,
    "document_handlers": [
      {
        "id": "markdown",
        "label": "Markdown",
        "extensions": [".md", ".markdown"],
        "mime_types": ["text/markdown"],
        "route": "/document",
        "resource_param": "path"
      }
    ]
  }
}
```

### Supported `host_capabilities`

- `navigation`
- `app_state`
- `file_intents`
- `file_dialogs`
- `file_watch`
- `aichat`
- `enterprise_gateway`
- `deep_links`
- `theme_read`
- `event_subscribe`

These declarations are meant to describe which stable host features the plugin expects through the public SDK layer.

### Window policy

The optional `window` block lets plugins describe how the host should open plugin routes and resources in a multi-window HaloForge session.

- `default_open_mode`: `smart`, `current`, `new_window`, `reuse_existing`, or `reuse_or_new`.
- `reuse_key`: `plugin`, `route`, `resource`, or `none`.
- `allow_multiple`: whether more than one window can show this plugin.
- `document_handlers`: extension/MIME handlers that route files or resources into plugin pages.

This is declarative only. The host still owns actual window creation, focus, restore, and conflict handling.

`document_handlers` are the supported plugin-owned "open with" capability. Host menu actions can still be source-specific: File > Open Markdown is a current-window navigation action, while OS file activation and deep links may use the plugin's multi-window policy.

The app menu bar is host-owned. The current Host API does not expose arbitrary plugin menu injection; add a documented manifest/SDK contribution before relying on plugin-provided File/Edit/View menu items.

## Rust crate

The Rust crate now exports:

- `HostCapability`
- `PUBLIC_HOST_API_VERSION`

The permission model also includes explicit host-facing permissions:

- `host_navigation`
- `host_app_state_read`
- `host_file_intents`
- `host_file_dialogs`
- `host_file_watch`
- `host_aichat_access`
- `host_enterprise_gateway_access`
- `host_deep_links`
- `host_theme_read`
- `host_event_subscribe`

This keeps host integration auditable instead of hidden inside private bridge calls.

## Frontend SDK

Use the public SDK hooks:

```tsx
import {
  registerPlugin,
  definePlugin,
  useHostNavigation,
  useHostFileIntent,
  useHostFileWatch,
  useHostAI,
  usePluginDeepLink,
  usePluginNavigation,
  usePluginWindows,
  useHostTheme,
  enterpriseGateway,
  createPluginLogger,
  pickHostFile,
} from "@haloforge/plugin-sdk";

function ExamplePanel() {
  const { openSettingsTab } = useHostNavigation();
  const navigation = usePluginNavigation();
  const windows = usePluginWindows();
  const { intent, consume } = useHostFileIntent();
  usePluginDeepLink((link) => console.log("Received deep link", link.route, link.params));
  const { models, selectedModelId, sendMessage, createSession, getStreamState } = useHostAI();
  const gateway = enterpriseGateway();
  const { theme } = useHostTheme();
  const logger = createPluginLogger("example");
  void logger.info("Example panel mounted", { theme: theme.type });

  return null;
}

export default registerPlugin("dev.haloforge.example", definePlugin({
  panel: ExamplePanel,
}));
```

### Public host hooks

- `useHostAppState()`
- `useHostNavigation()`
- `useHostFileIntent()`
- `useHostModels()`
- `useAvailableModels()`
- `useHostAI()`
- `enterpriseGateway()`
- `pluginDeepLinks()` / `onPluginDeepLink()` / `usePluginDeepLink()`
- `pluginNavigation()` / `usePluginNavigation()`
- `pluginWindows()` / `usePluginWindows()`
- `pluginCurrentWindow()` / `usePluginCurrentWindow()` / `usePluginWindowTitle()`
- `useHostTheme()`
- `useHostEvent()`
- `pickHostFile()`
- `pickHostDirectory()`
- `saveHostFile()`
- `log()` / `createPluginLogger()`

The SDK may still adapt to HaloForge's current bridge internally, but plugin code no longer needs to know how the host is wired underneath.

### Plugin panel routes

Level 0 plugin panels can synchronize internal pages with HaloForge window Back/Forward:

```tsx
import { useEffect } from "react";
import { usePluginNavigation } from "@haloforge/plugin-sdk";

function Panel() {
  const navigation = usePluginNavigation();

  function openDetail(id: string) {
    navigation.pushRoute(`/detail/${id}`, { params: { id } });
  }

  useEffect(() => {
    const route = navigation.current?.route ?? "/";
    // Update local tab/router state from host Back/Forward or deep links.
  }, [navigation.current?.route]);
}
```

Use `pushRoute()` for user-visible page changes and `replaceRoute()` for state refinements such as filters. Existing plugins that do not call this API still work, but HaloForge can only restore the plugin module, not its internal page.

### Plugin windows and resources

Use `pluginNavigation()` when the plugin is changing the page inside the current window. Use `pluginWindows()` when the plugin wants HaloForge to open a plugin route or resource in the best host window.

```tsx
import { usePluginWindows } from "@haloforge/plugin-sdk";

function DocumentsPanel() {
  const windows = usePluginWindows();

  async function openDocument(path: string) {
    await windows.openResource(path, {
      route: "/document",
      params: { path },
      reuseKey: "resource",
      openMode: "reuse_or_new",
    });
  }

  async function openDetail(id: string) {
    await windows.openPluginRoute(`/detail/${id}`, {
      params: { id },
      reuseKey: "route",
      openMode: "reuse_or_new",
    });
  }
}
```

The host combines these options with the manifest `window` block. Explicit SDK options can refine the request, but the host still owns final window creation, focus, session restore, and safety checks.

### Current Window Title

Plugins can update the native title of the current HaloForge window. Desktop shells use this value for taskbar previews and hover tooltips.

```tsx
import { usePluginWindowTitle } from "@haloforge/plugin-sdk";

function MarkdownPanel({ fileName }: { fileName: string | null }) {
  usePluginWindowTitle(fileName, { subtitle: "Markdown" });
}
```

The host only accepts title updates from the plugin that owns the active plugin module or route. Passing `null` or unmounting the hook resets the title to the host default.

### Plugin deep links

HaloForge can route plugin-scoped launch URLs to installed plugins:

```text
haloforge://plugin/dev.haloforge.switchboard/v1/import?source=https%3A%2F%2Fexample.com%2Fswitchboard.json
```

The host opens the matching plugin module first, then the SDK delivers a `PluginDeepLink` with `pluginId`, `route`, `url`, `params`, and `receivedAt`. Plugins decide whether to handle the route:

```tsx
import { onPluginDeepLink } from "@haloforge/plugin-sdk";

const unsubscribe = onPluginDeepLink((link) => {
  if (link.route === "/v1/import") {
    console.log(link.params.source);
  }
});
```

React components can use `usePluginDeepLink(handler)` instead. After a one-shot import succeeds, call `clearPendingPluginDeepLink()` so the same pending link is not replayed after remount.

### Managed image gateway

`enterpriseGateway()` exposes host-mediated image generation, image edits, and saved output listing for plugins granted `host_enterprise_gateway_access`.

The function name is retained for compatibility with the first gateway implementation. Plugin UI should describe it as "HaloForge Cloud gateway" or "managed image gateway" unless the product surface is explicitly enterprise-only.

For Community Edition support, image plugins should also offer a custom OpenAI-compatible endpoint mode when practical. The host-managed gateway may route through HaloForge Cloud or Enterprise Server, and plugin code should not depend on which backend is active.

### Logging

`log()` and `createPluginLogger()` route frontend diagnostics into the HaloForge app log file at `~/.haloforge/logs/haloforge.log.YYYY-MM-DD`. Use them for plugin lifecycle, request start/success/failure, and recoverable host integration failures. Keep details small and JSON-serializable, and never include API keys, bearer tokens, full prompts, or raw image/base64 payloads.

## `hf-pack` guidance

`hf-pack check` and `hf-pack pack` now warn when plugin source code appears to rely on:

- direct `__HF_HOST` access
- direct host IPC calls such as `aichat_send_message`

Those warnings are there to keep plugins aligned with the public SDK and improve long-term black-box compatibility.

They now also warn on direct `plugin_invoke` usage so plugin frontends are nudged toward `invokePlugin()` / `invokeOtherPlugin()` instead of hand-built wire names.

After packaging, use the HaloForge `hf` CLI to install into a local workspace:

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/plugin/dist/package/<plugin-id>-<version>.hfpkg --json
npm run hf -- plugin list --json
```

On Windows installed builds, `hf` is added to PATH and can be run directly from a new terminal. macOS automatic PATH linking is not implemented yet; run `command -v hf` before assuming the global command exists.
