# Official Plugin Publishing

This document records the release flow for the three public deliverables in `haloforge-plugin-api` plus the official HaloForge plugin publishing path.

## Scope

This repository ships three public artifacts:

1. Rust crate: `haloforge-plugin-api`
2. npm package: `@haloforge/plugin-sdk`
3. npm package: `@haloforge/plugin-pack`

For official HaloForge plugins, publish these SDK/tooling packages first when the plugin release depends on new APIs or packaging behavior.

## Before you publish

1. Bump versions intentionally:
   - root `Cargo.toml`
   - `sdk/package.json`
   - `pack/package.json`
2. Build and verify locally:
   - `cargo test`
   - `npm run build` in `sdk/`
   - `npm run build` in `pack/`
3. Make sure the npm scope and crates.io account are correct.

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
npm publish --access public
Pop-Location
```

## Publish `@haloforge/plugin-pack`

From the package directory:

```powershell
Push-Location "G:\Git\haloforge-plugin-api\pack"
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
