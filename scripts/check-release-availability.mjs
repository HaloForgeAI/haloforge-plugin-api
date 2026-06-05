import { appendFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const versions = JSON.parse(await readFile(new URL("../versions.json", import.meta.url), "utf8"));
const version = String(versions.pluginApiVersion ?? "").trim();

if (!version) {
  throw new Error("versions.json pluginApiVersion is required.");
}

async function registryHas(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "haloforge-plugin-api-release-check",
    },
  });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`Registry check failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return true;
}

const encodedSdk = encodeURIComponent("@haloforge/plugin-sdk");
const encodedPack = encodeURIComponent("@haloforge/plugin-pack");

const cratePublished = await registryHas(`https://crates.io/api/v1/crates/haloforge-plugin-api/${version}`);
const sdkPublished = await registryHas(`https://registry.npmjs.org/${encodedSdk}/${version}`);
const packPublished = await registryHas(`https://registry.npmjs.org/${encodedPack}/${version}`);

const lines = [
  `version=${version}`,
  `crate_published=${String(cratePublished)}`,
  `sdk_published=${String(sdkPublished)}`,
  `pack_published=${String(packPublished)}`,
];

for (const line of lines) {
  console.log(line);
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}
