# HaloForge Plugin Development Guide

This guide is the canonical engineering standard for HaloForge plugins. It covers the plugin shape, Rust backend contract, React panel contract, host SDK usage, local test flow, release flow, and the UX rules official plugins must follow.

For the hosted documentation site, use `https://docs.haloforge.dev/plugins`.

## Design Goals

HaloForge plugins should feel like part of HaloForge, not like embedded websites. A plugin can be authored outside the main app, but it must use the public SDK, host theme tokens, host controls, scoped CSS, and explicit permissions.

The plugin host should remain a black box:

- Do not read `window.__HF_HOST` or other private globals.
- Do not call private Tauri commands directly when an SDK helper exists.
- Do not construct `plugin_invoke` wire command names by hand; use `invokePlugin()` or `invokeOtherPlugin()`.
- Do not assume enterprise-only services are present in Community Edition. Provide a local or custom endpoint path when the feature can work without a managed HaloForge service.

## Capability Levels

| Level | Use case | Typical registration |
| --- | --- | --- |
| 0 | Top-level module in the sidebar | `defineModulePlugin()` or `definePlugin({ panel })` |
| 1 | Feature inside an existing module | `definePlugin({ panel })` with level 1 manifest config |
| 2 | UI slot injection | `definePlugin({ slots })` |
| 3 | Assistant registration | `defineAssistantPlugin()` |
| 4 | Headless service or workflow backend | Rust backend commands and manifest level 4 config |

Pick the smallest level that fits the product surface. A full workspace such as Image Studio should be Level 0; a toolbar button should be Level 2.

## Recommended Repository Layout

Use `templates/level0-rust-react` as the starting point for official UI plugins.

```text
my-plugin/
  manifest.json
  backend/
    Cargo.toml
    src/lib.rs
  app/
    package.json
    src/index.tsx
    src/Panel.tsx
    src/styles.css
  assets/
  dist/
```

This keeps native code, frontend code, packaged assets, and release output separated. The packer can build both sides and emit a signed `.hfpkg`.

## Manifest Contract

Every plugin needs a `manifest.json` at the repository root.

```json
{
  "id": "dev.example.my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "Short user-facing summary.",
  "author": "Example",
  "compatibility": {
    "min_app_version": "0.8.0",
    "min_host_api_version": "0.2.18"
  },
  "capability_levels": [0],
  "host_capabilities": ["navigation", "file_intents", "theme_read"],
  "integration": {
    "level0": {
      "module_id": "my-plugin",
      "module_label": "My Plugin",
      "module_icon": "Sparkles",
      "sidebar_position": "main",
      "sidebar_order": 120,
      "panel_entry": "app/dist/index.js"
    }
  },
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
  },
  "entry": {
    "native": {
      "macos_arm64": "backend/target/release/libmy_plugin.dylib",
      "macos_x64": "backend/target/release/libmy_plugin.dylib",
      "windows_x64": "backend/target/release/my_plugin.dll",
      "linux_x64": "backend/target/release/libmy_plugin.so"
    },
    "frontend": "app/dist/index.js",
    "frontend_styles": "app/dist/styles.css"
  },
  "permissions": [
    { "type": "ipc_register" },
    { "type": "host_theme_read" }
  ],
  "commands": [
    { "id": "ping", "description": "Return plugin health information." }
  ]
}
```

Rules:

- `id` is stable forever. Do not rename it after publishing.
- `version` follows semver. Official plugins should start at `0.1.0`.
- `host_capabilities` must match SDK helpers used by the frontend.
- File watching must use `watchHostFile` or `useHostFileWatch` with `file_watch` and `host_file_watch`; do not hard-code host commands or events.
- `permissions` must be the smallest set needed.
- `entry.frontend` and `integration.*.panel_entry` should point to the built bundle.
- Native command IDs in `commands` must match the names registered by the Rust backend before SDK prefixing.

### Window policy

Plugins can declare a `window` block when their routes or resources should participate in HaloForge's multi-window dispatcher.

- `default_open_mode`: `smart`, `current`, `new_window`, `reuse_existing`, or `reuse_or_new`.
- `reuse_key`: `plugin`, `route`, `resource`, or `none`.
- `allow_multiple`: whether the plugin can have multiple windows at once.
- `document_handlers`: file/resource handlers that map extensions or MIME types into plugin routes.

The host still owns actual window creation, focus, session restore, and safety checks. The plugin declares intent; HaloForge decides the final target window.

`document_handlers` are the supported plugin-owned "open with" capability. Host menu actions can still be source-specific: File > Open Markdown is a current-window navigation action, while OS file activation and deep links may use the plugin's multi-window policy.

The app menu bar is host-owned. The current Host API does not expose arbitrary plugin menu injection; add a documented manifest/SDK contribution before relying on plugin-provided File/Edit/View menu items.

## Rust Backend

Use a Rust backend whenever the plugin needs:

- native file system access
- outbound HTTP without relying on browser CORS
- secret handling
- local process integration
- long-running or host-owned tasks
- privileged operations that need manifest permissions

Frontend-only plugins are acceptable for pure UI surfaces, simple slot renderers, or panels that only consume public host SDK hooks. Official plugins that call external APIs directly should normally put those calls behind Rust commands.

Minimal backend:

```rust
use haloforge_plugin_api::*;

pub struct MyPlugin;

impl MyPlugin {
    pub fn new() -> Self { Self }
}

impl HaloForgePlugin for MyPlugin {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            id: "dev.example.my-plugin".into(),
            name: "My Plugin".into(),
            version: "0.1.0".into(),
            description: "A sample HaloForge plugin".into(),
            author: "Example".into(),
            abi_version: PLUGIN_ABI_VERSION,
        }
    }

    fn on_load(
        &mut self,
        _ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError> {
        ipc.register("ping", Box::new(|args, _ctx| {
            Ok(serde_json::json!({
                "ok": true,
                "echo": args
            }))
        }))?;
        Ok(())
    }
}

declare_plugin!(MyPlugin, MyPlugin::new);
```

## Frontend Contract

Register the plugin bundle once:

```tsx
import { definePlugin, registerPlugin } from "@haloforge/plugin-sdk";
import { MyPanel } from "./Panel";

export default registerPlugin("dev.example.my-plugin", definePlugin({
  panel: MyPanel,
}));
```

Use the SDK for host integration:

- `invokePlugin()` for this plugin's Rust commands.
- `invokeOtherPlugin()` for declared plugin-to-plugin dependencies.
- `useHostTheme()` or `useAppTheme()` for theme tokens.
- `usePluginSettings()` for host-provided plugin settings.
- `useHostAI()` for host AI chat transport.
- `enterpriseGateway()` for the host-managed image gateway. The function name is retained for compatibility, but product UI should call this "HaloForge Cloud gateway" or "managed image gateway".
- `usePluginNavigation()` for Level 0 plugin panels with internal pages. Call `pushRoute()` on page-level navigation and update local state from `current` or `onRouteChange()` so HaloForge Back/Forward can restore the plugin page.
- `usePluginWindows()` when a plugin wants HaloForge to open one of its routes or resources in the best host window according to the manifest `window` policy.
- `AppSelect` for combo boxes and dropdowns.
- `pickHostFile()`, `pickHostDirectory()`, and `saveHostFile()` for host-owned file dialogs.

Do not build controls with raw HTML selects if the SDK has an equivalent host control.

`usePluginNavigation()` and `usePluginWindows()` solve different problems:

```tsx
import { usePluginNavigation, usePluginWindows } from "@haloforge/plugin-sdk";

function Panel() {
  const navigation = usePluginNavigation();
  const windows = usePluginWindows();

  function openLocalDetail(id: string) {
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

Use navigation for current-window history. Use windows for route/resource handoff to the host multi-window dispatcher. Plugins should not call private Tauri commands to create windows.

Plugins that show a specific document or task can update the native window title:

```tsx
import { usePluginWindowTitle } from "@haloforge/plugin-sdk";

usePluginWindowTitle(fileName, { subtitle: "Markdown" });
```

HaloForge only accepts title updates from the plugin that owns the active plugin module or route, so background panels cannot overwrite another plugin's title.

## UX And Styling Rules

Official plugins must adapt to HaloForge's shell:

- Scope CSS under a plugin root class such as `.hfmy-root`.
- Do not style `body`, `html`, or global element selectors outside the plugin root.
- Use HaloForge CSS variables first: `--color-background`, `--color-surface`, `--color-foreground`, `--color-foreground-secondary`, `--color-border`, `--color-primary`, and shell variables such as `--hf-shell-bg`.
- Support light and dark themes without hard-coding a single palette.
- Use `AppSelect` for dropdowns, host file pickers for file selection, and lucide icons for icon buttons.
- Keep cards at 8px radius or less unless the host surface already uses another radius.
- Do not put page sections inside nested cards.
- Do not add visible instructional copy that explains basic UI mechanics.
- Keep text responsive. Labels, buttons, chips, and cards must not overflow at narrow widths.

## Internationalization

Plugins should ship English and Chinese strings for all user-visible UI text.

Recommended pattern:

- Create a typed translation key map.
- Read `localStorage["hf:locale"]` when available.
- Fall back to `navigator.language`.
- Fall back to English for missing keys.
- Keep provider names and API terms stable, but localize labels, buttons, status, errors, and empty states.

Use neutral product language in Community Edition. For example, show "HaloForge Cloud gateway" or "Managed gateway", not "Enterprise gateway", unless the UI surface is explicitly enterprise-only.

## Managed Image Gateway And Community Fallback

Image generation plugins should support two paths:

1. **Managed gateway**: call `enterpriseGateway()` from `@haloforge/plugin-sdk`, request `host_capabilities: ["enterprise_gateway"]`, and declare `{ "type": "host_enterprise_gateway_access" }`.
2. **Custom endpoint**: let Community Edition users configure an OpenAI-compatible `baseUrl` and optional API key. Route HTTP through the Rust backend when CORS or secret handling matters.

The managed gateway may be backed by HaloForge Cloud or Enterprise Server depending on the signed-in host. Plugin UI should not make that distinction unless it directly affects the user's action.

## Local Development Flow

Use the same checks before every handoff:

```bash
npm install
npm run typecheck
npm run build
cargo fmt --check
cargo check
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --out dist/package
```

Install the package into a local HaloForge checkout:

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/my-plugin/dist/package/dev.example.my-plugin-0.1.0.hfpkg --json
```

Then launch HaloForge and verify:

- the plugin panel mounts
- the bundle registers the same plugin ID as `manifest.json`
- light and dark themes look native
- SDK controls render correctly
- Rust commands return expected data
- expected permissions appear in the install prompt
- logs have no panel registration, IPC, or permission errors

## Packaging And Release

For official plugins:

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release --out dist/package
npx @haloforge/plugin-pack metadata dist/package/dev.example.my-plugin-0.1.0.hfpkg \
  --signing-key-id haloforge-official-2026-05 \
  --signing-key-env HF_PLUGIN_SIGNING_PRIVATE_KEY \
  --pretty \
  --output dist/catalog-draft.json
```

Official repositories should release from GitHub Actions using repository secrets:

- `hf_plugin_signing_private_key`
- `hf_plugin_signing_key_id`
- `HF_ADMIN_TOKEN` when the workflow submits catalog metadata

Publish SDK and packager releases before publishing plugins that require new SDK or permission support.

## Review Checklist

- Manifest ID, version, entries, host capabilities, permissions, and commands match implementation.
- Frontend registers exactly once with the manifest plugin ID.
- No direct private host bridge usage.
- No direct `plugin_invoke` wire names.
- UI uses host tokens and SDK controls.
- English and Chinese strings cover all visible text.
- Community Edition path works without Enterprise Server.
- Rust backend handles external HTTP and secrets when needed.
- `hf-pack check`, frontend build, Rust check, and local install pass.
