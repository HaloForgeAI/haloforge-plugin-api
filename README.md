# HaloForge Plugin API

Build native plugins for [HaloForge](https://github.com/HaloForgeAI) — the Game Dev Team Workbench & AI Assistant.

This repository contains **both** the Rust crate and the JavaScript/TypeScript SDK that plugin authors need.

- SDK repository: https://github.com/HaloForgeAI/haloforge-plugin-api
- HaloForge homepage: https://github.com/HaloForgeAI
- Hosted plugin docs: https://docs.haloforge.dev/plugins

## Packages

| Package | Language | Registry | Install |
|---------|----------|----------|---------|
| `haloforge-plugin-api` | Rust | [crates.io](https://crates.io/crates/haloforge-plugin-api) | `cargo add haloforge-plugin-api serde_json` |
| `@haloforge/plugin-sdk` | TypeScript | [npm](https://www.npmjs.com/package/@haloforge/plugin-sdk) | `npm i @haloforge/plugin-sdk react react-dom @tauri-apps/api lucide-react` |
| `@haloforge/plugin-pack` | CLI | npm | `npx @haloforge/plugin-pack check .` |

## Start a Plugin

For production plugin work, start with the full guide and template:

- [Plugin development guide](docs/plugin-development-guide.md)
- [中文插件开发指南](docs/zh/plugin-development-guide.md)
- [Level 0 Rust + React template](templates/level0-rust-react)
- [Plugin developer agent skill](skill/SKILL.md)

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

Permission names are strict. For AI Chat access, the only valid manifest permission name is `host_aichat_access`. For enterprise model gateway access, use `host_enterprise_gateway_access`.

```json
{
    "id": "com.example.hello-plugin",
    "name": "Hello Plugin",
    "version": "0.1.0",
    "description": "My first HaloForge plugin",
    "author": "You",
    "homepage": "https://github.com/you/hello-plugin",
    "compatibility": {
        "min_app_version": "0.8.0",
        "min_host_api_version": "0.2.16"
    },
    "capability_levels": [2],
    "host_capabilities": [
        "navigation",
        "file_intents",
        "file_dialogs",
        "aichat",
        "theme_read"
    ],
    "integration": {
        "level2": {
            "slots": ["devkit.toolbar"]
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

The `window.document_handlers` block is the supported plugin-owned "open with" capability. HaloForge still owns actual window creation, focus, restore, and source-specific menu behavior. The current Host API does not expose arbitrary plugin injection into the File/Edit/View menu bar; add a documented manifest/SDK contribution before relying on plugin-provided menu items.

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

When HaloForge loads the bundle, it injects the runtime plugin context needed by `invokePlugin`, slot context, and the public host hooks. Plugin authors should prefer the SDK hooks over touching `window.__HF_HOST` directly.

For host-owned file pickers and AI transport helpers, the SDK also exports:

- `pickHostFile()`
- `pickHostDirectory()`
- `saveHostFile()`
- `usePluginDeepLink()` / `onPluginDeepLink()`
- `pluginWindows()` / `usePluginWindows()`
- `pluginCurrentWindow()` / `usePluginWindowTitle()`
- `useHostAI().createSession(...)`
- `useHostAI().getStreamState(...)`
- `log()` and `createPluginLogger()`

Frontend plugin logs written through `createPluginLogger()` are routed into HaloForge's app log file at `~/.haloforge/logs/haloforge.log.YYYY-MM-DD`.

For multi-window plugins, use `usePluginNavigation()` for current-window page history and `usePluginWindows()` when asking HaloForge to open a route or resource in the best host window:

```tsx
import { usePluginWindows } from "@haloforge/plugin-sdk";

const windows = usePluginWindows();

await windows.openPluginRoute("/detail/42", {
  params: { id: "42" },
  reuseKey: "route",
  openMode: "reuse_or_new",
});

await windows.openResource("<project-root>/README.md", {
  route: "/document",
});
```

The host combines these requests with the manifest `window` policy. Plugins declare intent; HaloForge owns window creation, reuse, focus, and restore behavior.

Plugins can also update the current native window title, which is what desktop shells use for taskbar previews:

```tsx
import { usePluginWindowTitle } from "@haloforge/plugin-sdk";

usePluginWindowTitle("README.md", { subtitle: "Markdown" });
```

### 6. Validate and package the plugin

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release
npx @haloforge/plugin-pack metadata dist/dev.haloforge.example-0.1.0.hfpkg --signing-key-id haloforge-official-2026-05 --signing-key-env HF_PLUGIN_SIGNING_PRIVATE_KEY --pretty --output dist/catalog-draft.json
npx @haloforge/plugin-pack submit dist/catalog-draft.json --token-env HF_ADMIN_TOKEN
```

The packer validates `manifest.json`, builds the Rust backend, builds the frontend bundle, collects optional `assets/` and `LICENSE`, then writes a `.hfpkg` archive into `dist/`.

### Logging and diagnostics

Rust plugins can write into the same HaloForge log stream through the provided context:

```rust
ctx.log(LogLevel::Info, "image request started request_id=hfis-123 model=gpt-image-2.0");
ctx.log(LogLevel::Error, "image request failed request_id=hfis-123 status=502 elapsed_ms=1842");
```

Frontend plugins should use the SDK helper:

```tsx
import { createPluginLogger } from "@haloforge/plugin-sdk";

const logger = createPluginLogger("gateway");
await logger.info("Generation started", { model: "gpt-image-2.0", size: "1024x1024" });
await logger.error("Generation failed", { status: 502, elapsedMs: 1842 });
```

Log operational fields such as model, size, status, elapsed time, request ID, and output counts. Do not log API keys, bearer tokens, full prompts, or raw image/base64 payloads.

### 7. Install into a local HaloForge workspace

Use the HaloForge `hf` CLI to install and inspect the package locally:

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/my-plugin/dist/dev.haloforge.example-0.1.0.hfpkg --json
npm run hf -- plugin list --json
```

`npm run hf -- ...` is the source-checkout form. Installed Windows builds add `hf` to PATH, so a new terminal can use `hf plugin ...` directly. macOS automatic PATH linking is not implemented yet; run `command -v hf` before assuming the global command exists.

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
- `host_capabilities`: stable black-box-compatible host features consumed through `@haloforge/plugin-sdk`.
- `permissions`: the host capabilities your plugin needs approved.

See the [HaloForge organization](https://github.com/HaloForgeAI) for real plugin examples.

Additional docs:

- [docs/public-host-api.md](docs/public-host-api.md)
- [docs/official-plugin-publishing.md](docs/official-plugin-publishing.md)
- [docs/plugin-development-guide.md](docs/plugin-development-guide.md)
- [docs/zh/plugin-development-guide.md](docs/zh/plugin-development-guide.md)

## CLI Packager

`@haloforge/plugin-pack` is the public packager for HaloForge plugins.

- `hf-pack check <plugin-dir>` validates `manifest.json`.
- `hf-pack info <plugin-dir-or-.hfpkg>` prints plugin metadata.
- `hf-pack pack <plugin-dir>` builds and assembles a distributable `.hfpkg` archive.

It rejects invalid permission names such as `host_a_i_chat_access` and points plugin authors to the canonical `host_aichat_access` name.
- `hf-pack metadata <path.hfpkg>` emits catalog draft JSON and can sign it directly for official plugin publishing.
- `hf-pack submit <catalog-draft.json>` uploads that draft to `admin.haloforge.dev`.

The CLI supports these plugin layouts:

- `manifest.json` at the plugin root.
- Rust backend in `backend/Cargo.toml`, `native/Cargo.toml`, `rust/Cargo.toml`, or root `Cargo.toml`.
- Frontend app in `frontend/package.json`, `ui/package.json`, `web/package.json`, `app/package.json`, or root `package.json`.
- Optional `assets/`, `native/`, and `LICENSE` files in the plugin root.

It also supports common build-output layouts where the manifest points to packaged paths like `frontend/index.js`, while the actual frontend build emits files under `frontend/dist/` or `frontend/build/`.

`hf-pack check` and `hf-pack pack` also warn on:

- direct `__HF_HOST` access
- direct host IPC strings such as `aichat_send_message`
- direct `plugin_invoke` usage instead of `invokePlugin()` / `invokeOtherPlugin()`

`hf-pack` is not the same tool as HaloForge's `hf` CLI. Use `hf-pack` to create `.hfpkg` archives; use `hf` to install those archives into the local HaloForge workspace and verify the installed plugin state.

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
