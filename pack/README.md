# @haloforge/plugin-pack

`@haloforge/plugin-pack` is the public HaloForge plugin packager CLI.

Use it to validate a plugin directory, inspect an existing `.hfpkg`, and produce a distributable package that HaloForge can install.

## Run With npx

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release
npx @haloforge/plugin-pack metadata dist/dev.haloforge.git-1.1.0.hfpkg --pretty --output dist/catalog-draft.json
npx @haloforge/plugin-pack metadata dist/dev.haloforge.git-1.1.0.hfpkg --signing-key-id haloforge-official-2026-05 --signing-key-env HF_PLUGIN_SIGNING_PRIVATE_KEY --pretty --output dist/catalog-draft.json
```

## Commands

```bash
hf-pack check <plugin-dir>
hf-pack info <plugin-dir-or-.hfpkg>
hf-pack pack <plugin-dir> [--out dist] [--release] [--no-backend] [--no-frontend] [--target <triple>]
hf-pack metadata <path.hfpkg> [--artifact-url <url>] [--source official] [--signing-key-id <id>] [--signing-key-env HF_PLUGIN_SIGNING_PRIVATE_KEY] [--output <path>] [--pretty]
hf-pack submit <catalog-draft.json> [--api-base-url https://admin.haloforge.link] [--token-env HF_ADMIN_TOKEN]
```

## Supported Layout

```text
my-plugin/
  manifest.json
  backend/
    Cargo.toml
    src/
  app/
    package.json
    src/
  assets/
  LICENSE
```

The Rust backend can also live at the plugin root as `Cargo.toml` and `src/`.

The CLI also accepts these common variants:

- Backend in `backend/`, `native/`, `rust/`, or the plugin root.
- Frontend in `frontend/`, `app/`, `ui/`, `web/`, or the plugin root.
- Frontend builds emitted to `dist/`, `build/`, or `.output/`.

## Black-box compatibility checks

`hf-pack check` and `hf-pack pack` validate `host_capabilities` and `compatibility.min_host_api_version` when present.

They also warn when plugin source code appears to depend on:

- direct `__HF_HOST` access
- direct host IPC calls such as `aichat_send_message`

Those warnings are meant to steer plugins toward the documented `@haloforge/plugin-sdk` host APIs.

## What the CLI Does

1. Validates `manifest.json`.
2. Builds the Rust backend with `cargo build` unless `--no-backend` is used.
3. Builds the frontend app with the detected package manager unless `--no-frontend` is used.
4. Copies declared frontend outputs, packaged native binaries, optional `assets/`, and `LICENSE` into a staging directory.
5. Writes `<plugin-id>-<version>.hfpkg` and `<plugin-id>-<version>.hfpkg.sha256` to the output directory.

## Frontend Build Notes

- The CLI detects `npm`, `pnpm`, `yarn`, and `bun` from lockfiles.
- If `package.json` declares a `packageManager` field, the CLI prefers that over lockfile heuristics.
- By default, a frontend `dist/` directory is packaged under the top-level directory declared by `entry.frontend`, usually `frontend/`.
- This lets a repository keep source in `app/` while still packaging `frontend/index.js` for HaloForge.

## Catalog Metadata

`hf-pack metadata` emits the JSON draft accepted by the HaloForge catalog admin API. It can now sign plugin metadata directly with `--signing-key-id` plus either `--signing-key-base64` or `--signing-key-env`.

`hf-pack submit` accepts `HF_ADMIN_TOKEN`, and also falls back to `HF_SESSION_TOKEN` / `HF_SESSION` for local operator flows that already hold an `hfsess_...` token.

When `hf-pack pack` builds a targeted native artifact, it rewrites the staged manifest so `entry.native` and `compatibility.platforms` only describe the actual packaged target instead of every source-declared platform.
