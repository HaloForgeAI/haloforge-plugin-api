# HaloForge Plugin API

Build native plugins for [HaloForge](https://github.com/HaloForgeAI) — the Game Dev Team Workbench & AI Assistant.

This repository contains **both** the Rust crate and the JavaScript/TypeScript SDK that plugin authors need.

- SDK repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI

## Packages

| Package | Language | Registry | Install |
|---------|----------|----------|---------|
| `haloforge-plugin-api` | Rust | [crates.io](https://crates.io/crates/haloforge-plugin-api) | `cargo add haloforge-plugin-api serde_json` |
| `@haloforge/plugin-sdk` | TypeScript | [npm](https://www.npmjs.com/package/@haloforge/plugin-sdk) | `npm i @haloforge/plugin-sdk react react-dom @tauri-apps/api lucide-react` |
| `@haloforge/plugin-pack` | CLI | npm | `npx @haloforge/plugin-pack check .` |

## Start a Plugin

### 1. Create the Rust backend

```bash
cargo new my-plugin --lib
cd my-plugin
cargo add haloforge-plugin-api serde_json
```

Then make sure your crate builds as a dynamic library:

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]
```

### 2. Create the frontend bundle

You can use any React-compatible bundler. A minimal setup looks like this:

```bash
mkdir frontend
cd frontend
npm init -y
npm i @haloforge/plugin-sdk react react-dom @tauri-apps/api lucide-react
npm i -D typescript @types/react @types/react-dom
```

Build your frontend into the file referenced by `manifest.json` under `entry.frontend`.

### 3. Add a manifest.json

Every plugin ships with a `manifest.json` that declares compatibility, capabilities, entry points, and permissions.

```json
{
    "id": "com.example.hello-plugin",
    "name": "Hello Plugin",
    "version": "0.1.0",
    "description": "My first HaloForge plugin",
    "author": "You",
    "homepage": "https://github.com/you/hello-plugin",
    "compatibility": {
        "min_app_version": "0.1.0"
    },
    "capability_levels": [2],
    "integration": {
        "level2": {
            "slots": ["devkit.toolbar"]
        }
    },
    "entry": {
        "native": {
            "windows_x64": "native/hello_plugin.dll",
            "macos_arm64": "native/libhello_plugin.dylib",
            "linux_x64": "native/libhello_plugin.so"
        },
        "frontend": "frontend/dist/index.js"
    },
    "permissions": [
        { "type": "ipc_register" }
    ],
    "commands": [
        {
            "id": "hello",
            "description": "Return a greeting"
        }
    ]
}
```

### 4. Implement the native backend

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

### 5. Implement the frontend entry

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

When HaloForge loads the bundle, it injects the runtime plugin context needed by `invokePlugin`, hooks, slot context, and theme helpers.

### 6. Validate and package the plugin

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release
```

The packer validates `manifest.json`, builds the Rust backend, builds the frontend bundle, collects optional `assets/` and `LICENSE`, then writes a `.hfpkg` archive into `dist/`.

## Recommended Layout

```text
my-plugin/
    Cargo.toml
    manifest.json
    src/
        lib.rs
    frontend/
        package.json
        src/
            index.tsx
```

## Plugin Manifest

The most important manifest fields are:

- `capability_levels`: which HaloForge extension tiers your plugin uses.
- `integration`: per-level configuration, like slot IDs or module metadata.
- `entry.native`: the compiled Rust library paths for each platform you ship.
- `entry.frontend`: the built JavaScript bundle HaloForge should load.
- `permissions`: the host capabilities your plugin needs approved.

See the [HaloForge organization](https://github.com/HaloForgeAI) for real plugin examples.

## CLI Packager

`@haloforge/plugin-pack` is the public packager for HaloForge plugins.

- `hf-pack check <plugin-dir>` validates `manifest.json`.
- `hf-pack info <plugin-dir-or-.hfpkg>` prints plugin metadata.
- `hf-pack pack <plugin-dir>` builds and assembles a distributable `.hfpkg` archive.

The CLI supports these plugin layouts:

- `manifest.json` at the plugin root.
- Rust backend in `backend/Cargo.toml`, `native/Cargo.toml`, `rust/Cargo.toml`, or root `Cargo.toml`.
- Frontend app in `frontend/package.json`, `ui/package.json`, `web/package.json`, `app/package.json`, or root `package.json`.
- Optional `assets/`, `native/`, and `LICENSE` files in the plugin root.

It also supports common build-output layouts where the manifest points to packaged paths like `frontend/index.js`, while the actual frontend build emits files under `frontend/dist/` or `frontend/build/`.

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
