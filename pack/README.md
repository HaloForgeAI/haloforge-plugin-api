# @haloforge/plugin-pack

`@haloforge/plugin-pack` is the public HaloForge plugin packager CLI.

Use it to validate a plugin directory, inspect an existing `.hfpkg`, and produce a distributable package that HaloForge can install.

## Run With npx

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release
npx @haloforge/plugin-pack metadata dist/dev.haloforge.git-1.1.0.hfpkg --pretty --output dist/catalog-draft.json
```

## Commands

```bash
hf-pack check <plugin-dir>
hf-pack info <plugin-dir-or-.hfpkg>
hf-pack pack <plugin-dir> [--out dist] [--release] [--no-backend] [--no-frontend] [--target <triple>]
hf-pack metadata <path.hfpkg> [--artifact-url <url>] [--source official] [--output <path>] [--pretty]
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

`hf-pack metadata` emits the JSON draft accepted by the HaloForge catalog admin API. Use `hf-pack submit` with `HF_ADMIN_TOKEN` to upload it to `admin.haloforge.link`.

Signing metadata is intentionally conservative in the npm packer: pass a precomputed `--signature` if you need signed metadata from this CLI version.
