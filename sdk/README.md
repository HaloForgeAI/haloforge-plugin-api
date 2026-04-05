# @haloforge/plugin-sdk

The official frontend SDK for building HaloForge plugins.

## Install

```bash
npm i @haloforge/plugin-sdk
```

## Quick Start

```tsx
import { definePlugin, registerPlugin, invokePlugin } from "@haloforge/plugin-sdk";

const plugin = definePlugin({
  id: "com.example.my-plugin",
  slots: {
    "devkit.toolbar": () => <button onClick={handleClick}>Greet</button>,
  },
});

async function handleClick() {
  const result = await invokePlugin<{ message: string }>("hello", { name: "HaloForge" });
  alert(result.message);
}

registerPlugin(plugin);
```

## Related Packages

- Rust backend crate: `haloforge-plugin-api`
- Repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI
