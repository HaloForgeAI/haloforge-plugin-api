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
- `pickHostFile`, `pickHostDirectory`, `saveHostFile`: stable host file dialog helpers.
- `usePluginSettings`, `useHostData`, `useSlotContext`: read plugin and host state inside your React components.
- `useAppTheme`: read HaloForge theme mode and CSS variables inside your plugin.
- `AppSelect`: use the same host-styled dropdown/listbox HaloForge uses in the app.
- `log`, `createPluginLogger`: write plugin frontend diagnostics into the HaloForge application log.

## Public Host API

Prefer these host helpers over reading `window.__HF_HOST` directly:

- `useHostNavigation()` for module switches and settings tabs
- `useHostFileIntent()` for startup/external file-open intents
- `pickHostFile()` / `pickHostDirectory()` / `saveHostFile()` for host-owned file dialogs
- `useHostModels()` / `useAvailableModels()` for model lists and current selection
- `useHostAI()` for AI transport, session creation, stream-state polling, and generation stop
- `enterpriseGateway()` for host-mediated enterprise image generation/edit access without exposing session tokens
- `useHostTheme()` for theme tokens
- `useHostEvent()` for stable host events
- `log()` / `createPluginLogger()` for app-level plugin diagnostics

These helpers currently adapt to HaloForge's existing host bridge internally, but they give plugin authors one documented surface that can keep working as HaloForge evolves.

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

## Enterprise Image Gateway

Plugins that need enterprise model gateway access must declare and receive approval for:

```json
{ "type": "host_enterprise_gateway_access" }
```

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
    });
    console.log(result.hf_output_assets?.[0]?.public_url ?? result.data?.[0]?.url);
  }

  return <button onClick={() => void generate()}>Generate</button>;
}
```

The host performs permission checks and forwards the request with the signed-in enterprise session. Plugins never receive the cloud session token.

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
