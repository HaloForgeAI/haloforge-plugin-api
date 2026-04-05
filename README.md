# HaloForge Plugin API

Build native plugins for [HaloForge](https://github.com/HaloForgeAI) — the Game Dev Team Workbench & AI Assistant.

This repository contains **both** the Rust crate and the JavaScript/TypeScript SDK that plugin authors need.

- SDK repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI

## Packages

| Package | Language | Registry | Install |
|---------|----------|----------|---------|
| `haloforge-plugin-api` | Rust | [crates.io](https://crates.io/crates/haloforge-plugin-api) | `cargo add haloforge-plugin-api` |
| `@haloforge/plugin-sdk` | TypeScript | [npm](https://www.npmjs.com/package/@haloforge/plugin-sdk) | `npm i @haloforge/plugin-sdk` |

## Quick Start (Rust Backend)

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
haloforge-plugin-api = "0.1"
serde_json = "1"
```

```rust
use haloforge_plugin_api::*;

pub struct MyPlugin;

impl MyPlugin {
    pub fn new() -> Self { Self }
}

impl HaloForgePlugin for MyPlugin {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            id: "com.example.my-plugin".into(),
            name: "My Plugin".into(),
            version: "0.1.0".into(),
            description: "A sample HaloForge plugin".into(),
            author: "You".into(),
            abi_version: PLUGIN_ABI_VERSION,
        }
    }

    fn on_load(
        &mut self,
        _ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError> {
        ipc.register("hello", Box::new(|args, _ctx| {
            let name = args["name"].as_str().unwrap_or("World");
            Ok(serde_json::json!({ "message": format!("Hello, {name}!") }))
        }))?;
        Ok(())
    }

    fn on_unload(&mut self) -> Result<(), PluginError> {
        Ok(())
    }
}

declare_plugin!(MyPlugin, MyPlugin::new);
```

## Quick Start (Frontend)

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

## Plugin Manifest

Every plugin needs a `manifest.json`. See the [HaloForge organization](https://github.com/HaloForgeAI) for examples.

## Capability Levels

| Level | Type | Description |
|-------|------|-------------|
| 0 | Module | Full sidebar module |
| 1 | Module Feature | Tab inside an existing module |
| 2 | UI Extension | Inject into UI slots |
| 3 | AI Assistant | Custom AI assistant persona |
| 4 | Service | Workflow step types & background services |

## License

MIT
