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
import { definePlugin, invokePlugin } from "@haloforge/plugin-sdk";

function HelloButton() {
  async function handleClick() {
    const result = await invokePlugin<{ message: string }>("hello", { name: "HaloForge" });
    alert(result.message);
  }

  return <button onClick={() => void handleClick()}>Greet</button>;
}

export default definePlugin({
  slots: {
    "devkit.toolbar": HelloButton,
  },
});
```

## What To Use

- `definePlugin`: Level 1 and Level 2 plugins such as tabs and slot injections.
- `defineModulePlugin`: Level 0 plugins that provide a full module panel.
- `defineAssistantPlugin`: Level 3 plugins that register an assistant UI.
- `invokePlugin`: call commands exposed by your Rust backend.
- `usePluginSettings`, `useHostData`, `useSlotContext`: read host state inside your React components.

## Typical Setup

1. Build the native backend with `haloforge-plugin-api`.
2. Build the frontend bundle with this SDK.
3. Point `manifest.json` to the emitted frontend file via `entry.frontend`.
4. Load the plugin inside HaloForge and call `invokePlugin` from mounted components.

## Related Packages

- Rust backend crate: `haloforge-plugin-api`
- Repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI
