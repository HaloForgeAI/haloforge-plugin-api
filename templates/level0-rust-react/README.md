# Level 0 Rust + React Plugin Template

Copy this template when building a full HaloForge module plugin.

```bash
cp -R templates/level0-rust-react my-plugin
cd my-plugin
```

Then replace:

- `dev.example.template`
- `Template Plugin`
- `template-plugin`
- `template_ping`
- package/crate names

## Local Flow

```bash
cd app
npm install
npm run typecheck
npm run build

cd ../backend
cargo fmt --check
cargo check

cd ..
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --out dist/package
```

Install into a local HaloForge checkout:

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/my-plugin/dist/package/dev.example.template-0.1.0.hfpkg --json
```
