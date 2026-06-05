# Official Plugin Publishing

This document records the release flow for the three public deliverables in `haloforge-plugin-api` plus the official HaloForge plugin publishing path.

## Scope

This repository ships three public artifacts:

1. Rust crate: `haloforge-plugin-api`
2. npm package: `@haloforge/plugin-sdk`
3. npm package: `@haloforge/plugin-pack`

For official HaloForge plugins, publish these SDK/tooling packages first when the plugin release depends on new APIs or packaging behavior.
Official plugin lockfiles should be refreshed only after the required SDK, pack, and crate versions are published to npm/crates.io; do not commit lockfiles that point at local tarballs or workspace paths.

## Before you publish

1. Update `versions.json`.
   - Keep `pluginApiVersion` as the single release version for the Rust crate, both npm packages, public host API version, docs, and templates.
   - Run `node scripts/sync-versions.mjs` from the repository root.
   - Do not hand-edit artifact versions in `Cargo.toml`, `sdk/package.json`, `pack/package.json`, or template dependency files unless the sync script is also updated.
2. Build and verify locally:
   - `cargo test`
   - `npm run build` in `sdk/`
   - `npm run build` in `pack/`
3. Commit the synced version changes.
4. Make sure repository secrets are configured:
   - `NPM_TOKEN`: npm automation token with publish access to `@haloforge/plugin-sdk` and `@haloforge/plugin-pack`.
   - `CARGO_REGISTRY_TOKEN`: crates.io API token for `haloforge-plugin-api`.

## Tag-based release action

The preferred publish flow is tag-driven. The GitHub Actions workflow publishes all three public artifacts when a `vX.Y.Z` tag is pushed.

```powershell
node scripts/sync-versions.mjs
git diff --exit-code
node scripts/verify-release-version.mjs v0.2.13
git tag v0.2.13
git push origin v0.2.13
```

The workflow rejects tags that do not exactly match `versions.json` (`v${pluginApiVersion}`), runs Rust and npm verification, then publishes in this order:

1. `haloforge-plugin-api` crate
2. `@haloforge/plugin-sdk`
3. `@haloforge/plugin-pack`

Before publishing, the workflow checks that both publish tokens are present and runs `npm whoami` with `NPM_TOKEN`. If that preflight fails, nothing is published.

Use the manual commands below only as a fallback if the release action is unavailable.

## crates.io

Authenticate once:

```powershell
cargo login
```

Publish the Rust crate from the repository root:

```powershell
cargo publish --manifest-path "G:\Git\haloforge-plugin-api\Cargo.toml"
```

## npm authentication

Authenticate once:

```powershell
npm login
npm whoami
```

`npm adduser` is also acceptable if you prefer that flow.

Note: if you copied older scratch notes, `pm login` is a typo; use `npm login`.

## Publish `@haloforge/plugin-sdk`

From the package directory:

```powershell
Push-Location "G:\Git\haloforge-plugin-api\sdk"
npm pack --dry-run
npm publish --access public
Pop-Location
```

## Publish `@haloforge/plugin-pack`

From the package directory:

```powershell
Push-Location "G:\Git\haloforge-plugin-api\pack"
npm pack --dry-run
npm publish --access public
Pop-Location
```

## Tarball publish flow

If you already built tarballs with `npm pack`, you can publish the artifacts directly:

```powershell
npm publish /Users/loyio/gitRepo/HaloForge/temp/npm-artifacts/haloforge-plugin-pack-0.1.2.tgz --access public
npm publish /Users/loyio/gitRepo/HaloForge/temp/npm-artifacts/haloforge-plugin-sdk-0.1.2.tgz --access public

npm publish /Users/loyio/gitRepo/HaloForge/temp/npm-artifacts/haloforge-plugin-pack-0.1.3.tgz --access public
```

If npm prompts for 2FA:

```powershell
npm publish /Users/loyio/gitRepo/HaloForge/temp/npm-artifacts/haloforge-plugin-pack-0.1.2.tgz --access public --otp 123456
npm publish /Users/loyio/gitRepo/HaloForge/temp/npm-artifacts/haloforge-plugin-sdk-0.1.2.tgz --access public --otp 123456
```

## Recommended release order

When a HaloForge plugin depends on new SDK or pack behavior, publish in this order:

1. `haloforge-plugin-api` crate
2. `@haloforge/plugin-sdk`
3. `@haloforge/plugin-pack`
4. the official plugin package itself
5. catalog metadata submission / review / publish

That order avoids official plugin releases depending on unpublished tooling.

## Official plugin package release

After the SDK/tooling packages are out, release the actual official plugin:

```powershell
npx --yes @haloforge/plugin-pack@<version> check .
npx --yes @haloforge/plugin-pack@<version> pack . --release --target x86_64-pc-windows-msvc --out dist/plugin-release
npx --yes @haloforge/plugin-pack@<version> metadata dist/plugin-release/<plugin-id>-<plugin-version>.hfpkg `
  --artifact-url https://github.com/HaloForgeAI/<plugin-repo>/releases/download/v<plugin-version>/<plugin-id>-<plugin-version>.hfpkg `
  --source official `
  --signing-key-id <signing-key-id> `
  --pretty `
  --output dist/plugin-release/catalog-draft.json
npx --yes @haloforge/plugin-pack@<version> submit dist/plugin-release/catalog-draft.json --api-base-url https://admin.haloforge.link
```

Then complete the admin-side review and publish flow in HaloForge Cloud.

## Quick checklist

- `cargo login` completed
- `npm login` completed
- versions bumped
- local build verification passed
- crate published
- `sdk` published
- `pack` published
- official plugin `.hfpkg` built
- catalog draft submitted
- admin review + publish completed
