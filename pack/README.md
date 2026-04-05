# @haloforge/plugin-pack

`@haloforge/plugin-pack` is the public HaloForge plugin packager CLI.

Use it to validate a plugin directory, inspect an existing `.hfpkg`, and produce a distributable package that HaloForge can install.

## Run With npx

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release
```

## Commands

```bash
hf-pack check <plugin-dir>
hf-pack info <plugin-dir-or-.hfpkg>
hf-pack pack <plugin-dir> [--out dist] [--release] [--no-backend] [--no-frontend] [--target <triple>]
```

## Supported Layout

```text
my-plugin/
  manifest.json
  backend/
    Cargo.toml
    src/
  frontend/
    package.json
    src/
  assets/
  LICENSE
```

The Rust backend can also live at the plugin root as `Cargo.toml` and `src/`.

The CLI also accepts these common variants:

- Backend in `backend/`, `native/`, `rust/`, or the plugin root.
- Frontend in `frontend/`, `ui/`, `web/`, `app/`, or the plugin root.
- Frontend builds emitted to `dist/`, `build/`, or `.output/`.

## What the CLI Does

1. Validates `manifest.json`.
2. Builds the Rust backend with `cargo build` unless `--no-backend` is used.
3. Builds the frontend app with the detected package manager unless `--no-frontend` is used.
4. Copies declared frontend outputs, packaged native binaries, optional `assets/`, and `LICENSE` into a staging directory.
5. Writes `<plugin-id>-<version>.hfpkg` to the output directory.

## Frontend Build Notes

- The CLI detects `npm`, `pnpm`, `yarn`, and `bun` from lockfiles.
- If `package.json` declares a `packageManager` field, the CLI prefers that over lockfile heuristics.
- Frontend output paths are taken from `manifest.json` via `entry.frontend` and `entry.frontend_styles`.
- If those files are actually emitted under `dist/`, `build/`, or `.output/`, the CLI remaps them back to the packaged paths declared in the manifest.