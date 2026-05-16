# HaloForge Plugin Developer

Use this skill when creating, reviewing, or fixing HaloForge plugins.

## Core Rule

Treat HaloForge as a black-box host. Plugin code must use `@haloforge/plugin-sdk`, `haloforge-plugin-api`, and `@haloforge/plugin-pack` instead of private host globals or hard-coded Tauri IPC names.

## First Checks

1. Read `manifest.json`.
2. Confirm `id`, `version`, `capability_levels`, `integration`, `entry`, `host_capabilities`, `permissions`, and `commands`.
3. Confirm the frontend registers the exact same plugin ID with `registerPlugin(...)`.
4. Confirm Rust backend command names match `manifest.commands[].id`.
5. Inspect visible UI text for English and Chinese coverage.
6. Search for forbidden private access:

```bash
rg -n "__HF_HOST|__HALOFORGE_PLUGIN_HOST__|plugin_invoke|invoke\\(\"aichat_|document\\.body|<select" .
```

`__HALOFORGE_PLUGIN_HOST__` may appear inside the official SDK implementation only, not plugin source code.

## Implementation Rules

- Use `invokePlugin()` for this plugin's Rust commands.
- Use `invokeOtherPlugin()` for declared cross-plugin dependencies.
- Use `useHostTheme()` or `useAppTheme()` for host theme tokens.
- Use `usePluginSettings()` for host-managed settings.
- Use `useHostAI()` for AIChat transport.
- Use `enterpriseGateway()` only for the host-managed image gateway. The UI label should be "HaloForge Cloud gateway" or "Managed gateway", not "Enterprise gateway", unless the surface is enterprise-only.
- Use `AppSelect` instead of raw `<select>` for combo boxes.
- Use host file picker helpers instead of hidden file inputs when the user is selecting local files through the host.
- Put external HTTP, secret handling, filesystem access, process calls, and long tasks behind Rust backend commands.
- Scope CSS under one plugin root class. Do not write global `body`, `html`, or unscoped element styles.
- Use HaloForge tokens such as `--color-background`, `--color-surface`, `--color-foreground`, `--color-foreground-secondary`, `--color-border`, `--color-primary`, and shell tokens such as `--hf-shell-bg`.
- Support light and dark modes.
- Start official plugin versions at `0.1.0`.

## Community And Managed Services

Features backed by HaloForge Cloud or Enterprise Server need a Community Edition path when possible.

For image generation plugins:

- Managed path: `enterpriseGateway()`, `host_capabilities: ["enterprise_gateway"]`, and `{ "type": "host_enterprise_gateway_access" }`.
- Community path: user-configured OpenAI-compatible `baseUrl` and optional API key.
- If CORS or secret handling matters, custom endpoint calls should go through Rust.

## Template

For a new full module plugin, copy:

```text
templates/level0-rust-react
```

Then rename plugin ID, crate/package names, manifest module config, command names, and UI text.

## Required Verification

Run the checks that apply to the plugin:

```bash
npm run typecheck
npm run build
cargo fmt --check
cargo check
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --out dist/package
```

Install locally into HaloForge:

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/plugin/dist/package/<plugin-id>-<version>.hfpkg --json
```

If the UI fails with `Plugin panel not loaded`, check:

- bundle `registerPlugin()` ID equals manifest `id`
- `entry.frontend` and level panel entry point to the built file
- package includes frontend assets
- browser console errors from bundle execution
- Rust backend load errors and permission errors in host logs

## Documentation

When changing plugin APIs, update:

- `docs/plugin-development-guide.md`
- `docs/zh/plugin-development-guide.md`
- `docs/public-host-api.md`
- `sdk/README.md`
- template files if the recommended pattern changed
