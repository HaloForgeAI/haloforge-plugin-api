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
    "min_app_version": "0.1.0",
    "min_host_api_version": "0.1.0"
  },
  "host_capabilities": [
    "navigation",
    "app_state",
    "file_intents",
    "file_dialogs",
    "aichat",
    "theme_read",
    "event_subscribe"
  ]
}
```

### Supported `host_capabilities`

- `navigation`
- `app_state`
- `file_intents`
- `file_dialogs`
- `aichat`
- `theme_read`
- `event_subscribe`

These declarations are meant to describe which stable host features the plugin expects through the public SDK layer.

## Rust crate

The Rust crate now exports:

- `HostCapability`
- `PUBLIC_HOST_API_VERSION`

The permission model also includes explicit host-facing permissions:

- `host_navigation`
- `host_app_state_read`
- `host_file_intents`
- `host_file_dialogs`
- `host_aichat_access`
- `host_enterprise_gateway_access`
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
  useHostAI,
  useHostTheme,
  enterpriseGateway,
  pickHostFile,
} from "@haloforge/plugin-sdk";

function ExamplePanel() {
  const { openSettingsTab } = useHostNavigation();
  const { intent, consume } = useHostFileIntent();
  const { models, selectedModelId, sendMessage, createSession, getStreamState } = useHostAI();
  const gateway = enterpriseGateway();
  const { theme } = useHostTheme();

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
- `useHostTheme()`
- `useHostEvent()`
- `pickHostFile()`
- `pickHostDirectory()`
- `saveHostFile()`

The SDK may still adapt to HaloForge's current bridge internally, but plugin code no longer needs to know how the host is wired underneath.

`enterpriseGateway()` exposes host-mediated image generation, image edits, and saved output listing for plugins granted `host_enterprise_gateway_access`. The host forwards requests through the signed-in enterprise session and does not expose cloud tokens to plugin code.

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
