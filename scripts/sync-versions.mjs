import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionsPath = path.join(repoRoot, "versions.json");
const versions = JSON.parse(await readFile(versionsPath, "utf8"));
const pluginApiVersion = String(versions.pluginApiVersion ?? "").trim();
const minAppVersion = String(versions.minAppVersion ?? "").trim();

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pluginApiVersion)) {
  throw new Error("versions.json pluginApiVersion must be a semver string.");
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(minAppVersion)) {
  throw new Error("versions.json minAppVersion must be a semver string.");
}

async function updateText(relativePath, updater) {
  const absolutePath = path.join(repoRoot, relativePath);
  const before = await readFile(absolutePath, "utf8");
  const after = updater(before);
  if (after !== before) {
    await writeFile(absolutePath, after, "utf8");
  }
}

async function updateJson(relativePath, updater) {
  await updateText(relativePath, (before) => {
    const json = JSON.parse(before);
    updater(json);
    return `${JSON.stringify(json, null, 2)}\n`;
  });
}

const sdkRange = `^${pluginApiVersion}`;

await updateText("Cargo.toml", (text) =>
  text.replace(/^version = ".*"$/m, `version = "${pluginApiVersion}"`),
);

await updateText("src/lib.rs", (text) =>
  text.replace(
    /pub const PUBLIC_HOST_API_VERSION: &str = ".*";/,
    `pub const PUBLIC_HOST_API_VERSION: &str = "${pluginApiVersion}";`,
  ),
);

await updateText("src/manifest.rs", (text) =>
  text
    .replace(
      /("id": "dev\.haloforge\.markdown"[\s\S]*?"min_app_version": ")([^"]+)(")/,
      `$1${minAppVersion}$3`,
    )
    .replace(
      /("id": "dev\.haloforge\.markdown"[\s\S]*?"min_host_api_version": ")([^"]+)(")/,
      `$1${pluginApiVersion}$3`,
    ),
);

await updateJson("sdk/package.json", (json) => {
  json.version = pluginApiVersion;
});

await updateJson("pack/package.json", (json) => {
  json.version = pluginApiVersion;
});

await updateJson("pack/package-lock.json", (json) => {
  json.version = pluginApiVersion;
  if (json.packages?.[""]) {
    json.packages[""].version = pluginApiVersion;
  }
});

await updateJson("templates/level0-rust-react/manifest.json", (json) => {
  json.compatibility.min_app_version = minAppVersion;
  json.compatibility.min_host_api_version = pluginApiVersion;
});

await updateJson("templates/level0-rust-react/app/package.json", (json) => {
  json.dependencies["@haloforge/plugin-sdk"] = sdkRange;
});

await updateText("templates/level0-rust-react/backend/Cargo.toml", (text) =>
  text.replace(
    /haloforge-plugin-api = ".*"/,
    `haloforge-plugin-api = "${pluginApiVersion}"`,
  ),
);

for (const relativePath of [
  "README.md",
  "docs/public-host-api.md",
  "docs/plugin-development-guide.md",
  "docs/zh/plugin-development-guide.md",
]) {
  await updateText(relativePath, (text) =>
    text
      .replace(
        /"min_app_version": "\d+\.\d+\.\d+"/g,
        `"min_app_version": "${minAppVersion}"`,
      )
      .replace(
        /"min_host_api_version": "\d+\.\d+\.\d+"/g,
        `"min_host_api_version": "${pluginApiVersion}"`,
      ),
  );
}

console.log(`Synced HaloForge plugin API release version ${pluginApiVersion}.`);
